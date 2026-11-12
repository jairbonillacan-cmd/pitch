# A29 · Candidato NFL Minkowski v3.2 con Agregados Semanales EPA Estrictamente Causales (`w' < w`)

- **Agente:** `B9` (`b9-nfl-epa`) — Ola 3, Swarm `PREDLAB-V3.2`
- **Rama / Worktree:** `prediction-lab` (`C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\prediction-lab`, base `53ff835` tras Puerta 2 `19453fb` y cierre de `B7`)
- **Experimento reproducible:** `research/prediction-lab/experiments/EXP_V32_nfl_epa/`
- **Artefacto candidato exportado (inactivo):** `src/data/prediction/model_nfl_v3_2_candidate.json` (`SHA-256: ebf6c3c3cfe417d57a685f0b574fed212da3f1e58da8568434f82197f5a46158`, `"status": "candidate"`, `"production_activated": false`)
- **Registro en `holdout_trial_registry.jsonl`:** `trial_seq = 31` (`phase: "ola3_b9_nfl_epa_v3_2_candidate"`, `preset: "exp_v32_nfl_epa_logit_41"`, `eval_split: "walk_forward_dev"`, `unlock_holdout: false`, `config_hash: d8b88499896da5b5ea89e26c6e081298fb3334517d7d09cde99a034eaaa83d58`)
- **Veredicto ejecutivo (`OBSERVADO`):**
  1. **Salto de cobertura viva (`featureCoverage`):** en `predictLiveEdgeMatrix` (`src/domain/prediction/service.ts`) sobre los `46` enfrentamientos NFL de `live_matchday_v3_snapshot.json`, `featureCoverage` sube de **`4 / 29` (`13.79%`, `46/46` en `"low_coverage"`)** a **`34.37 / 41` (`83.83%` media, `82.93%` mínimo, `0/46` en `"low_coverage"`, `"ok"`)** en modo causal franquicia + QB/coach incumbente (`< 2025-02-02`), **`27.37 / 41` (`66.76%`, `"ok"`)** en modo conservador solo-franquicia, y **`41 / 41` (`100.00%`, `"ok"`)** en modo pre-kickoff con calendario y titular confirmado.
  2. **Mejora sobre baseline deportivo `v3.0` en `walk_forward_dev` (`< 2025-02-02T17:30:00Z`, `n = 3,891` sin empate):** el candidato exportable `v3_2_epa_logit_41` logra `LL = 0.622020 [0.611977, 0.632434]`, superando de forma **`"significativa"`** tanto al estado vivo actual `4/29` (**`ΔLL = -0.065911 [-0.075109, -0.056734]`**, `"significativa"`) como al histórico completo `v3.0 Logit 29/29` (**`ΔLL = -0.002516 [-0.004585, -0.000523]`**, `"significativa"`) y al `v3.0 Blend 29/29` de `A3`/`B4` (**`ΔLL = -0.002269 [-0.004096, -0.000345]`**, `"significativa"`). En la sub-partición diagnóstica fuera de selección `DEV_OOS 2020..2024` (`n = 1,339`), `v3_2_epa_logit_41` logra `ΔLL = -0.003153 [-0.006492, +0.000129]` (**`"no significativa"`**, el IC 95% cruza `0`).
  3. **Comparación honesta contra mercado y bloqueo de producción:** frente a la línea desvigorizada de consenso de `nflverse` (**`"sin cierre sharp"`**, `n = 3,890` pareados, `LL = 0.609080`), el candidato puro deportivo pierde por **`ΔLL = +0.013040 [+0.007707, +0.017938]`** (**`"significativa"`** a favor del consenso `"sin cierre sharp"`). Además, el corpus prospectivo `nfl_sharp_closing.parquet` de `B6` cuenta con `39` filas sobre `13` juegos futuros y **`0 < 64` juegos liquidados**, por lo que la calibración contra cierre sharp real permanece en **`DESCONOCIDO`**. En consecuencia, este modelo se entrega estrictamente como **hipótesis candidata no probada** (`"status": "candidate"`, `"production_activated": false`, `0/60` segmentos de producción activos).

---

## 1. Reproducibilidad y Comandos Exactos

Todos los comandos se ejecutan desde la raíz del worktree `C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\prediction-lab` con cero lecturas de `holdout_sealed` (`>= 2025-02-02T17:30:00Z`):

```powershell
Set-Location "C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\prediction-lab"

# 1. Ingesta estática legal CC BY 4.0 de nflverse-data (1999..2024, podada estrictamente a < 2025-02-02)
.\research\prediction-lab\.venv\Scripts\python.exe research/prediction-lab/experiments/EXP_V32_nfl_epa/pbp_ingest.py

# 2. Ejecución completa del pipeline walk_forward_dev (corrida en seco sin tocar el registro global)
.\research\prediction-lab\.venv\Scripts\python.exe research/prediction-lab/experiments/EXP_V32_nfl_epa/run_experiment.py

# 3. Ejecución oficial registrando trial_seq en services/models/artifacts/holdout_trial_registry.jsonl
.\research\prediction-lab\.venv\Scripts\python.exe research/prediction-lab/experiments/EXP_V32_nfl_epa/run_experiment.py --record-trial

# 4. Suite completa de pruebas (anti-fuga w' < w, no-holdout, gobernanza, paridad TS<->Python y sellado v3.1)
.\research\prediction-lab\.venv\Scripts\python.exe -m pytest research/prediction-lab/experiments/EXP_V32_nfl_epa services/models -v
```

---

## 2. Cobertura Epistémica de Fuentes `nflverse` y Diseño Causal (`w' < w`)

### 2.1 Auditoría de disponibilidad por métrica (`1999..2024`, `< 2025-02-02`)

Los agregados por partido provienen exclusivamente de los releases abiertos estáticos de `github.com/nflverse/nflverse-data/releases` (`pbp` `1999..2024` + `pbp_participation` `2016..2024`, licencia abierta CC BY 4.0 / MIT, cero mecanismos anti-bot). En el instante de lectura (`pbp_ingest.py`), toda fila con `game_date >= "2025-02-02"` es descartada antes de cualquier agregación (`max_game_date = 2025-01-26`, excluyendo el Super Bowl LIX del `2025-02-09` perteneciente a `holdout_sealed`).

| Sub-métrica solicitada (§4.1 / B9) | Definición exacta a nivel jugada (`play_by_play`) | Temporadas `1999..2005` (solo warm-up) | Temporadas `2006..2024` (`100%` de `walk_forward_dev` `2010..2024`) | Etiqueta epistémica |
| :--- | :--- | :--- | :--- | :--- |
| **Dropback EPA** (ofensivo, defensivo y neto sin tiempo basura) | `mean(epa)` sobre jugadas con `qb_dropback == 1` (sin *spikes*/*kneels*); versión filtrada restringida a `0.05 <= wp <= 0.95` | `100.0%` disponible | **`100.0%` disponible (`3,903 / 3,903`)** | `OBSERVADO` |
| **Rush EPA** (ofensivo y defensivo) | `mean(epa)` sobre acarreos diseñados (`rush_attempt == 1 & qb_dropback == 0`) | `100.0%` disponible | **`100.0%` disponible (`3,903 / 3,903`)** | `OBSERVADO` |
| **Success%** (early-down `1st/2nd` y global) | `mean(success)` (`epa > 0`) en `down in {1, 2}` y en todos los snaps válidos | `100.0%` disponible | **`100.0%` disponible (`3,903 / 3,903`)** | `OBSERVADO` |
| **Pressure (proxy PBP estándar)** | `(sack == 1 \| qb_hit == 1) / qb_dropbacks` sufrido por la ofensiva y generado por la defensa | **`DESCONOCIDO`** (`qb_hit` no registrado por NFL antes de 2006; contraído al prior causal de liga) | **`100.0%` disponible (`3,903 / 3,903` más `2006..2009` de warm-up)** | `OBSERVADO` (`2006..2024`) / `DESCONOCIDO` (`1999..2005`) |
| **Pressure directa FTN/NGS (`was_pressure`)** | `was_pressure` en `pbp_participation` | **`DESCONOCIDO`** | Disponible en **`2016..2024`** (`60.71%` de `walk_forward_dev`; `4,950` equipo-juegos comparados, correlación de Pearson **`r = 0.4499`** con el proxy `sack \| qb_hit`) | `OBSERVADO` (`2016..2024`) / `DESCONOCIDO` (`1999..2015`) |
| **QB CPOE + EPA** (`starting QB`) | `mean(cpoe)` en pases con `cpoe` finito y `mean(qb_epa)` en participaciones del `qb_id` titular (`home_qb_id` / `away_qb_id`, `100%` poblados en `2010..2024`) | `EPA` `OBSERVADO`; `CPOE` **`DESCONOCIDO`** antes de 2006 (`air_yards` no registrado) | **`100.0%` disponible (`2006..2024`)** con contracción bayesiana explícita en Semana 1 o debut de QB | `OBSERVADO` (`2006..2024`) / `DESCONOCIDO` (`CPOE` `1999..2005`) |

### 2.2 Regla causal `w' < w` y contracción bayesiana (Semana 1 / debut de QB)

En `causal_epa_features.py`, los partidos se agrupan estrictamente por fecha calendario `gameday`:
1. **Fase de lectura pre-kickoff (`gameday' < gameday`, `w' < w`):** todas las features de los partidos jugados en la fecha `d` se leen del acumulador causal **antes** de incorporar ningún resultado o jugada ocurrida en `d`. Una guardia activa (`CausalLeakageError`) verifica en cada inserción que `last_ingested_gameday < current_gameday`.
2. **Transición entre temporadas (Semana 1):** al iniciar cada nueva temporada `s`, los contadores acumulados del equipo se contraen hacia el prior causal de liga (`γ_offseason = 0.45`, equivalente a retener el `45%` de la evidencia previa y regresar `55%` a la media causal de la liga calculada únicamente con temporadas `< s`), más decaimiento exponencial intratemporada `λ_week = 0.88` y pseudoconteos bayesianos `κ_team = 6.0` juegos equivalentes.
3. **Contracción bayesiana para mariscal titular (`QB CPOE + EPA`):** para el `qb_id` anunciado como titular antes del partido, sus sumas históricas ponderadas por jugadas (`γ_qb_offseason = 0.65`, `λ_qb_game = 0.965`) se contraen hacia un prior causal de reemplazo/novato (`μ_liga_causal - 0.04` EPA/dropback y `-1.2` puntos de CPOE) con fuerza `κ_epa = 120` dropbacks y `κ_cpoe = 140` pases evaluados:
   $$\hat{\theta}_{\text{QB}, w} = \frac{S_{\text{QB}, <w} + \kappa \cdot \mu_{\text{prior}, <w}}{N_{\text{QB}, <w} + \kappa}$$
   Así, en un debut absoluto (`N_{\text{QB}, <w} = 0`) o en Semana 1 tras temporada baja, el estimador regresa suavemente al prior causal sin producir `NaN` ni requerir imputación ciega.
4. **Prevención de doble conteo en `nfl_live.ts` (`OBSERVADO`):** dado que `src/domain/prediction/nfl_live.ts` aplica por defecto `w_net_epa = 0.85` y `w_net_success_pct = 0.012` cuando existen campos externos de SumerSports, el artefacto `model_nfl_v3_2_candidate.json` fija explícitamente `live_v3.priors = {"w_net_epa": 0.0, "w_net_success_pct": 0.0}` para evitar duplicar el efecto de EPA y `Success%` ya integrados en las 12 nuevas columnas del vector de 41 features.

Las **12 features EPA causales** añadidas a las 29 features base de `Minkowski v3.0` (`41` en total) son:
`off_dropback_epa_diff`, `def_dropback_epa_diff`, `off_rush_epa_diff`, `def_rush_epa_diff`, `off_ed_success_diff`, `def_ed_success_diff`, `net_success_rate_diff`, `off_pressure_rate_diff`, `def_pressure_rate_diff`, `net_nongarbage_epa_diff`, `qb_epa_per_db_diff`, `qb_cpoe_diff`.

---

## 3. Resultados en `walk_forward_dev` (`< 2025-02-02T17:30:00Z`)

### 3.1 Partición y selección de regularización

- **Universo oficial `A3` (`services/models/backtest.py`):** `70,812` eventos multi-deporte totales (`56,649` en `walk_forward_dev < 2025-02-02T17:30:00Z`, de los cuales **`3,903`** son NFL `2010..2024`: `3,891` sin empate y `12` empates; **`14,163`** eventos en `holdout_sealed` jamás tocados).
- **Selección de `C` exclusivamente en `VAL` (`2010..2019`, `n = 2,552` sin empate):** malla `C ∈ {0.002, 0.004, 0.006, 0.008, 0.012}` evaluada en walk-forward anual (`1999..s-1 -> s`):
  - `C = 0.0020`: `LL_VAL = 0.619278` *(óptimo seleccionado)*
  - `C = 0.0040`: `LL_VAL = 0.620059`
  - `C = 0.0060`: `LL_VAL = 0.620831`
  - `C = 0.0080`: `LL_VAL = 0.621423`
  - `C = 0.0120`: `LL_VAL = 0.622251`

### 3.2 Tabla de calibración 2-vías (`moneyline`, bootstrap determinista `mulberry32`, `1,000` réplicas, `seed = 20261111`)

| Variante / Benchmark (`walk_forward_dev`) | `n` | `Log-Loss` `[IC 95%]` | `Brier` `[IC 95%]` | `RPS` `[IC 95%]` | `ECE` `[IC 95%]` | `VAL 10-19 LL` | `DEV_OOS 20-24 LL` | Estado epistémico |
| :--- | ---: | :--- | :--- | :--- | :--- | ---: | ---: | :--- |
| **`v3_0_live_4_of_29`** (baseline vivo actual `13.79%` cobertura) | 3,891 | `0.687931` `[0.682976, 0.692830]` | `0.494765` `[0.489830, 0.499611]` | `0.247382` `[0.244915, 0.249806]` | `0.022876` `[0.007516, 0.037623]` | `0.684659` | `0.694168` | `OBSERVADO` |
| **`v3_0_logit_29`** (baseline histórico Logit `29/29`) | 3,891 | `0.624537` `[0.613690, 0.635627]` | `0.435454` `[0.425714, 0.445254]` | `0.217727` `[0.212857, 0.222627]` | `0.013434` `[0.006691, 0.029343]` | `0.621461` | `0.630398` | `OBSERVADO` |
| **`v3_0_blend_29`** (baseline `A3`/`B4` `75% Logit + 25% HGB`) | 3,891 | `0.624289` `[0.614259, 0.634843]` | `0.435205` `[0.425852, 0.444738]` | `0.217602` `[0.212926, 0.222369]` | `0.016667` `[0.008657, 0.031978]` | `0.621483` | `0.629637` | `OBSERVADO` |
| **`v3_2_live_25_of_41`** (candidato modo conservador solo-equipo) | 3,891 | `0.632674` `[0.624416, 0.640718]` | `0.442520` `[0.434715, 0.449917]` | `0.221260` `[0.217358, 0.224959]` | `0.025773` `[0.014576, 0.040011]` | `0.629021` | `0.639637` | `OBSERVADO` |
| **`v3_2_live_35_of_41`** (candidato vivo franquicia+QB `83.83%` cob.) | 3,891 | `0.623014` `[0.613271, 0.633300]` | `0.434174` `[0.425478, 0.443119]` | `0.217087` `[0.212739, 0.221560]` | `0.011788` `[0.005956, 0.028044]` | `0.619937` | `0.628878` | `OBSERVADO` |
| **`v3_2_epa_logit_41`** *(candidato exportado a TS `41/41`)* | 3,891 | **`0.622020`** `[0.611977, 0.632434]` | **`0.433247`** `[0.424305, 0.442387]` | **`0.216623`** `[0.212152, 0.221193]` | **`0.010454`** `[0.005729, 0.028311]` | `0.619278` | `0.627246` | `OBSERVADO` |
| **`v3_2_epa_blend_41`** (`75% Logit + 25% HGB` `41/41` offline) | 3,891 | **`0.621676`** `[0.611479, 0.631619]` | **`0.432875`** `[0.423559, 0.441936]` | **`0.216438`** `[0.211779, 0.220968]` | `0.016069` `[0.008414, 0.032595]` | `0.619217` | `0.626363` | `OBSERVADO` |
| **Consenso `nflverse` desvigorizado (`"sin cierre sharp"`)** | 3,890 | `0.609080` `[0.597081, 0.620236]` | `0.421625` `[0.410862, 0.431659]` | `0.210812` `[0.205431, 0.215829]` | `0.009382` `[0.005326, 0.026549]` | — | — | `OBSERVADO` (`"sin cierre sharp"`) |

*(Nota de consistencia cruzada con `B4`: sobre los `3,890` partidos pareados con consenso `nflverse` `"sin cierre sharp"`, `v3_0_blend_29` obtiene exactamente `LL = 0.624392`, coincidiendo al sexto decimal con `A29_calibracion_publicada.md` de `B4`, mientras que `v3_2_epa_logit_41` baja a `LL = 0.622120` y `v3_2_epa_blend_41` a `LL = 0.621775`.)*

### 3.3 Comparaciones pareadas `ΔLL = LL(candidato) - LL(referencia)` (`mulberry32`, `1,000` réplicas)

Valores negativos (`ΔLL < 0`) indican menor error logarítmico a favor del candidato:

| Comparación pareada | Partición | `n` | `ΔLL` puntual | `IC 95% bootstrap` | Significancia estadística |
| :--- | :--- | ---: | ---: | :--- | :--- |
| `v3_2_epa_logit_41` vs `v3_0_live_4_of_29` (`13.79%` vivo) | `walk_forward_dev` (`2010..2024`) | 3,891 | **`-0.065911`** | `[-0.075109, -0.056734]` | `"significativa"` |
| `v3_2_live_35_of_41` (`83.83%` vivo) vs `v3_0_live_4_of_29` | `walk_forward_dev` (`2010..2024`) | 3,891 | **`-0.064918`** | `[-0.073902, -0.055698]` | `"significativa"` |
| `v3_2_epa_logit_41` vs `v3_0_logit_29` (`29/29` histórico) | `walk_forward_dev` (`2010..2024`) | 3,891 | **`-0.002516`** | `[-0.004585, -0.000523]` | `"significativa"` |
| `v3_2_epa_logit_41` vs `v3_0_blend_29` (`A3`/`B4` histórico) | `walk_forward_dev` (`2010..2024`) | 3,891 | **`-0.002269`** | `[-0.004096, -0.000345]` | `"significativa"` |
| `v3_2_epa_blend_41` vs `v3_0_blend_29` (`A3`/`B4` histórico) | `walk_forward_dev` (`2010..2024`) | 3,891 | **`-0.002613`** | `[-0.004422, -0.000886]` | `"significativa"` |
| `v3_2_epa_logit_41` vs `v3_0_logit_29` (fuera de selección `C`) | `DEV_OOS` (`2020..2024`) | 1,339 | `-0.003153` | `[-0.006492, +0.000129]` | **`"no significativa"`** *(IC 95% cruza `0`)* |
| `v3_2_epa_blend_41` vs `v3_0_blend_29` (fuera de selección `C`) | `DEV_OOS` (`2020..2024`) | 1,339 | `-0.003273` | `[-0.006442, -0.000016]` | `"significativa"` |
| `v3_2_epa_logit_41` vs Consenso `nflverse` (**`"sin cierre sharp"`**) | `walk_forward_dev` pareado | 3,890 | **`+0.013040`** | `[+0.007707, +0.017938]` | `"significativa"` *(a favor del consenso `"sin cierre sharp"`)* |
| `v3_2_epa_blend_41` vs Consenso `nflverse` (**`"sin cierre sharp"`**) | `walk_forward_dev` pareado | 3,890 | **`+0.012695`** | `[+0.007475, +0.017968]` | `"significativa"` *(a favor del consenso `"sin cierre sharp"`)* |

### 3.4 Verificación contra el corpus sharp real `nfl_sharp_closing.parquet` de `B6`

Al evaluar `research/prediction-lab/data/processed/nfl_sharp_closing.parquet` mediante `services.ingest.nfl_sharp_closing.evaluate_nfl_corpus_gate`:
- **`n_rows` (`OBSERVADO`):** `39` filas (`13` juegos prospectivos de temporada 2026 × `3` mercados: `moneyline`, `spread`, `totals`, capturados de `Pinnacle` vía The Odds API).
- **`n_settled_games` (`OBSERVADO`):** **`0`** (`< 64` mínimo requerido por compuerta estadística).
- **`corpus_sufficient_for_eval` (`OBSERVADO`):** `false`.
- **Calibración contra cierre sharp real de NFL:** **`DESCONOCIDO`** — bloqueada honestamente hasta acumular `>= 64` partidos liquidados con cierre real de Pinnacle/Smarkets. Asimismo, en `bt.run_backtest` (`A3`), el segmento `nfl` reporta `n_events_paired_closing = 0` (`n_closing_missing = 3,891`, `delta_log_loss = null`, `"no significativa"`), respetando que el consenso `nflverse` jamás se trata como cierre sharp.

---

## 4. Mejora de `featureCoverage` en Vivo y Paridad TS↔Python

La sonda cruzada `ts_parity_probe.ts` invocada con `npx vite-node` sobre `engine.ts::predictNFL` y `service.ts::predictLiveEdgeMatrix` comprueba (`OBSERVADO`):

| Métrica de Inferencia TypeScript (`service.ts` / `engine.ts`) | Baseline `model_nfl.json` (`v3.0`) | Candidato `model_nfl_v3_2_candidate.json` (`v3.2`, inactivo) |
| :--- | :--- | :--- |
| `status` / `production_activated` | Activo en lectura deportiva (`0/60` apuestas ejecutables) | **`"candidate"` / `false`** (`0/60` apuestas ejecutables) |
| `n_features` | `29` | `41` (`29` base + `12` EPA causales) |
| `featureCoverage` media en `live_matchday_v3_snapshot.json` (`46` juegos NFL) | **`4.00 / 29` (`13.79%`)** | **`34.37 / 41` (`83.83%`, mín. `82.93%`)** |
| Partidos marcados con `dataQualityFlag == "low_coverage"` (`< 50%`) | `46 / 46` (`100%`) | **`0 / 46` (`0%`, todos en `"ok"`)** |
| Campos dejados honestamente como `null` en snapshot sin calendario semanal | `25` de `29` columnas imputadas a la media | Solo `6` campos de cambio semanal (`rest_diff`, `prev_ot_diff`, `qb_change_*`, `coach_change_*`) + `cold_outdoor` en estadios abiertos sin `temp_f` |
| `executableBetsCount` | `0` | **`0`** |
| **Paridad numérica TS ↔ Python (`246` vectores: `200` dev + `46` live)** | `< 1e-12` | **`max |p_TS - p_Py| < 1e-15`** *(cumple holgadamente `< 1e-12` y `< 1e-9`)* |

---

## 5. Gobernanza, Fronteras e Inmutabilidad `v3.0` / `v3.1`

1. **Inmutabilidad SHA-256 verificada por test automático (`OBSERVADO`):**
   - `src/data/prediction/production_segments_v3_1.json`: `0bc03bbff96a5d82a1a7858e1e8623bf7bfdb250c546d2773a71d56ed9ada9bc`
   - `src/data/prediction/blend_weights_v3_1.json`: `b29d7a451f6011126997c122778b42ad3239c78337d17c5fa78d550f5c92739b`
   - `src/data/prediction/pick_policy_v3_1.json`: `2359c8f8822ea394a380202c04e0bcd010d1a3fae7c5c25b8c11ebe810bfb7d1`
   - `src/data/prediction/stale_lines_config.json`: `8bcb9c7be93270cde0cac2d58bc19f0381184dd2e769f358dd28334db2a05eac`
   - `src/domain/prediction/engine.ts`: `9270125c49e81adf57e90c76db07eb95f53ab35a5051e49265b35b80ed0553bc`
   - `services/models/artifacts/sealed_holdout_v3_1_eval.json`: `5c9e550bfd7889e44f674c91cf64cea4c07b4281fc72231b8cadff850309f2dd`
   - `src/data/prediction/model_nfl.json`: intacto (`0` líneas de diff).
2. **Higiene de artefactos pesados:** los archivos temporales de jugadas crudas bajo `EXP_V32_nfl_epa/raw_cache/` están excluidos por `.gitignore` local; únicamente se versionan los agregados semanales compactos reproducibles (`< 4 MB` por archivo) junto con sus hashes SHA-256 de origen en `manifest_pbp_dev.json`.
3. **Condición de promoción futura (`INFERIDO`):** el candidato `model_nfl_v3_2_candidate.json` NO debe conectarse a `service.ts` por defecto ni activar `production_enabled` hasta (a) cablear un alimentador semanal automático pre-kickoff de `rest_diff` y `starting_qb_id` confirmado en la temporada 2026 y (b) acumular `>= 64` partidos liquidados en `nfl_sharp_closing.parquet` para evaluar calibración y mezcla contra cierre sharp real de Pinnacle.
