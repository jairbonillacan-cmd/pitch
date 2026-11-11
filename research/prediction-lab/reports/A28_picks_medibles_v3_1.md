# A28 · Evaluación Única del Holdout Sellado y Síntesis Cuantitativa `PitchLab Prediction Lab v3.1`

> **Agente autor:** `a10-holdout` (Ingeniero de Evaluación Única del Holdout Sellado y Síntesis Final `v3.1`)
> **Fecha de cierre:** `2026-11-11` · **Rama / Worktree:** `prediction-lab` (`.worktrees/prediction-lab`)
> **Gobernanza estadística:** Apertura **única** del `holdout_sealed` (`14,163` eventos `>= 2025-02-02T17:30:00+00:00`, `20.0008%` de `70,812` eventos totales) con **`0` re-tuning post-holdout**, semilla determinista `20261111`, `bootstrap_samples = 1000` (`mulberry32`), retraso de ejecución `execution_delay_minutes = 2.0` y fricción `historical_delay_alpha = 0.05`.
> **Artefactos primarios auditables:**
> - Script reproducible: `services/models/evaluate_sealed_holdout_v3_1.py`
> - Suite de verificación: `services/models/test_sealed_holdout_v3_1.py`
> - Evaluación completa JSON: `services/models/artifacts/sealed_holdout_v3_1_eval.json`
> - Registro consolidado de ensayos (`29` corridas): `services/models/artifacts/holdout_trial_registry.jsonl`
> - Tabla de activación de segmentos en producción: `src/data/prediction/production_segments_v3_1.json`
> - Auditorías Red Team de Puertas 1–3 (`a9-verifier`): `research/prediction-lab/reports/A28_verificacion_swarm.md`

---

## 1. Resumen Ejecutivo y Veredicto Honesto en el Holdout Sellado

### 1.1 Trazabilidad de Reproducción (Cero Cifras Manuales)

Toda métrica reportada en este documento proviene de ejecuciones deterministas auditadas por commit sobre `research/prediction-lab/data/processed/odds_snapshots.parquet` (`5,442,989` filas pre-partido válidas):

| Ola / Agente | Commit | Script Ejecutado | Comando Exacto de Reproducción | Artefacto Generado |
|---|---|---|---|---|
| **Ola 1 · `A1`** | `c96c7b3` | `services/ingest/odds_snapshots.py` | `.\research\prediction-lab\.venv\Scripts\python.exe services/ingest/odds_snapshots.py` | `services/models/artifacts/odds_coverage_report.json` |
| **Ola 1 · `A2`** | `e41f463` | `services/models/clv_report.py` | `.\research\prediction-lab\.venv\Scripts\python.exe -m pytest services/models/test_clv_report.py` | `src/domain/prediction/{ledger,clv}.ts` |
| **Ola 1 · `A3`** | `a852528` | `services/models/backtest.py` | `.\research\prediction-lab\.venv\Scripts\python.exe services/models/backtest.py --preset baseline_v3_0 --out services/models/artifacts/baseline_v3_0_backtest.json` | `services/models/artifacts/baseline_v3_0_backtest.json` |
| **Puerta 1 · `A9`** | `622949c` | Auditoría Red Team Ola 1 | `.\research\prediction-lab\.venv\Scripts\python.exe -m pytest services/models -v` | `research/prediction-lab/reports/A28_verificacion_swarm.md` |
| **Ola 2 · `A4`** | `5b3df2c` | `services/models/blend_calibration.py` | `.\research\prediction-lab\.venv\Scripts\python.exe services/models/blend_calibration.py` | `src/data/prediction/blend_weights_v3_1.json` |
| **Ola 2 · `A5`** | `ce348e0` | `services/models/picks_engine.py` | `.\research\prediction-lab\.venv\Scripts\python.exe services/models/picks_engine.py` | `src/data/prediction/pick_policy_v3_1.json`, `services/models/artifacts/ola2_picks_backtest_dev.json` |
| **Puerta 2 · `A9`** | `c4439df` | Auditoría Red Team Ola 2 | `npx vitest run tests/prediction/` | `research/prediction-lab/reports/A28_verificacion_swarm.md` |
| **Ola 3 · `A6`** | `732a403` | `services/models/markets_2way.py` | `.\research\prediction-lab\.venv\Scripts\python.exe services/models/markets_2way.py` | `services/models/artifacts/markets_2way_eval.json`, `src/data/prediction/markets_2way_config.json` |
| **Ola 3 · `A7`** | `6583954`, `dfbf2e4` | `services/models/export_gbm_ts.py` | `.\research\prediction-lab\.venv\Scripts\python.exe services/models/export_gbm_ts.py` | `services/models/artifacts/gbm_eval_v3_1.json`, `src/data/prediction/gbm_trees_v3_1.json` |
| **Ola 3 · `A8`** | `700dd24` | `services/models/stale_lines.py` | `.\research\prediction-lab\.venv\Scripts\python.exe services/models/stale_lines.py` | `services/models/artifacts/stale_lines_report.json`, `src/data/prediction/stale_lines_config.json` |
| **Puerta 3 · `A9`** | `e0f7910` | Auditoría Red Team Ola 3 | `.\research\prediction-lab\.venv\Scripts\python.exe -m pytest services/models -v && npx vitest run` | `research/prediction-lab/reports/A28_verificacion_swarm.md` |
| **Ola 4 · `A10`** | *(este cierre)* | `services/models/evaluate_sealed_holdout_v3_1.py` | `.\research\prediction-lab\.venv\Scripts\python.exe services/models/evaluate_sealed_holdout_v3_1.py` | `services/models/artifacts/sealed_holdout_v3_1_eval.json`, `src/data/prediction/production_segments_v3_1.json` |

### 1.2 Veredicto Honesto en el Holdout Sellado (`>= 2025-02-02T17:30:00Z`, `14,163` eventos)

1. **Veredicto a nivel cartera (`Sistema Integrado v3.1: A4 + A5 + A8`, `trial_seq = 29`):**
   - Sobre los `14,163` eventos fuera de muestra (`2025-02-02` a `2026-11-08`), el sistema integrado congelado ejecutó **`50` picks** (`39` con cierre sharp válido de Pinnacle; `61.68u` apostadas, `PnL = -2.61u`, `0` violaciones a los topes duros `2.0u / 2.0u / 3.0u / 5.0u`).
   - **`CLV%` medio:** **`-2.27%`**, IC 95% bootstrap **`[-5.80%, +0.68%]`** (**`"no significativa"`**; `portfolio_clv_ci95_strictly_above_zero = false`).
   - **`CLV_prob` medio:** **`-0.94 pp`**, IC 95% **`[-2.05 pp, +0.27 pp]`** (**`"no significativa"`**); **`%CLV > 0` = `38.46%`** (`[23.08%, 53.85%]`).
   - **`ROI%` realizado:** **`-4.23%`**, IC 95% **`[-32.85%, +24.27%]`** (**`"no significativa"`**); **`MaxDD` = `9.88u`** (`[5.96u, 23.82u]`).
   - **Control de daño frente a la Línea Base `v3.0`:** aunque `v3.1` **no demostró ventaja positiva (`+CLV`) en el holdout sellado**, la disciplina de filtrado (`A4+A5+A8`) recortó el volumen de apuestas en `-70.9%` (`172` $\rightarrow$ `50` picks) y contuvo la sangría porcentual desde **`ROI = -17.97%`** en `v3.0` hasta **`ROI = -4.23%`** en `v3.1` (ambos con IC 95% que cruza `0`, `"no significativa"`).

2. **Veredicto a nivel segmento `liga × mercado` (`src/data/prediction/production_segments_v3_1.json`):**
   - Criterio duro de habilitación: un segmento `liga × mercado` solo recibe `production_enabled: true` si logra **`CLV% > 0` con IC 95% bootstrap válido (`n_picks_with_closing >= 15`) que NO cruce `0` en `holdout_sealed`**.
   - **Resultado exacto:** **`0 / 60` segmentos habilitados (`production_enabled: true = 0`, `production_enabled: false = 60`)**.
   - Incluso relajando el mínimo muestral de `n >= 15` a `n >= 6`, **`0` segmentos** tienen IC 95% bootstrap `> 0` (`segments_with_raw_bootstrap_ci95_gt_0_n_ge_6 = []`). El único segmento con bootstrap crudo `> 0` a muestra microscópica fue `E1::ah` con apenas **`n = 2` picks** (`CLV% = +5.35% [+4.20%, +6.51%]`), insuficiente para inferencia estadística seria (`insufficient_holdout_sample_for_valid_ci95_n_lt_15`).
   - En consecuencia, **la emisión automatizada de picks de apuesta queda apagada (`0` segmentos activos) en `production_segments_v3_1.json`**, tal como exige la gobernanza científica del proyecto.

3. **Diagnóstico causal de la divergencia `walk_forward_dev` (`CLV% = +4.96% [+3.11%, +7.01%]`) vs `holdout_sealed` (`CLV% = -2.27% [-5.80%, +0.68%]`):**
   - **Causa 1 — Ineficiencia nula de features tabulares estáticas frente al cierre Pinnacle (`a5_model_driven`):** Ya en `walk_forward_dev`, el subgrupo guiado por modelo puro (`a5_model_driven`, `12/60` segmentos sobrevivientes de `A4`) tuvo **`CLV% = -1.19% [-2.80%, +0.46%]`** (`"no significativa"`, `n = 120`) en `A5` y **`-1.27% [-2.87%, +0.42%]`** (`n = 118`) en el integrado; todo el `+CLV` de `walk_forward_dev` provenía de capturar aperturas recreativas desfasadas frente a la apertura sharp de Pinnacle (`a5_sharp_arb`: `+16.25%` en `A5`; `a8_stale_double_conf`: `+10.93%` en `A8`). En el holdout `2025–2026`, los `31` picks `a5_model_driven` (concentrados en `SC1::ah` con `24` picks y `SC0::ah` con `4` picks) confirmaron esa ausencia de alfa estructural con **`CLV% = -3.37% [-5.39%, -1.43%]`** (`significativa_negativa`).
   - **Causa 2 — Compresión de discrepancias de apertura `2025–2026` en CSV estáticos (`historical_fd`) y `0` ticks vivos en `scraped_ws`:** En `historical_fd` (`football-data.co.uk`, que solo publica `open` y `close`), las brechas gruesas entre casas recreativas europeas (`B365`, `WH`, `BW`) y la apertura de Pinnacle se comprimieron drásticamente en `2025–2026` (`19` oportunidades `A8` en `14,163` partidos). Aunque el **`57.89%`** (`11/19`) de los picks `A8` en el holdout batió al cierre de Pinnacle (`CLV_prob = +0.09 pp [-2.26, +1.91]`, `"no significativa"`), un par de movimientos adversos de cola bajo `alpha = 0.05` dejó la media de `CLV%` en `-1.10% [-8.27%, +3.94%]` (`"no significativa"`). Entretanto, **`scraped_ws` aportó `0 / 50` picks** porque en el lote actual `Caliente` solo tiene `1` captura sin par sharp, `Codere` y `Smarkets` tienen `0` filas válidas, y `Pinnacle` tiene una brecha mediana de `78.78 min` frente a los **`<= 3.69 min`** requeridos en `T-60m`.

---

## 2. Control de Pruebas Múltiples Antes y Durante la Apertura del Holdout

Antes de invocar por primera vez `unlock_holdout=True` en `services/models/evaluate_sealed_holdout_v3_1.py`, se auditaron y consolidaron cronológicamente todos los ensayos previos ejecutados sobre `walk_forward_dev` en `services/models/artifacts/holdout_trial_registry.jsonl`:

### 2.1 Consolidación de Corridas `run_backtest` (`29` entradas totales en `holdout_trial_registry.jsonl`)

| Bloque | Rango `trial_seq` | Registro Origen | `eval_split` | `unlock_holdout` | Corridas | Hashes Distintos | Descripción Auditable |
|---|---|---|---|---|---:|---:|---|
| **Ola 1 · `A3`** | `1 .. 3` | `holdout_trial_registry.jsonl` (`1..3`) | `walk_forward_dev` | `false` | `3` | `3` | `baseline_v3_0` (`Geodesic v2.0`) en `alpha = 0.05`, `0.00` y `0.10`. |
| **Ola 2 · `A5`** | `4 .. 9` | `holdout_trial_registry.jsonl` (`4..9`) | `walk_forward_dev` | `false` | `6` | `6` | Búsqueda causal OOF `wf_cfg1..3` (`3` corridas) + política congelada `pick_policy_v3_1` en `alpha = 0.05, 0.00, 0.10` (`3` corridas). |
| **Ola 3 · `A6`** | `10 .. 13` | `holdout_registry_a6.jsonl` (`1..4`) | `walk_forward_dev` | `false` | `4` | `4` | Mercados 2-vías Dixon-Coles (`G1::totals` `0` picks OOS en `alpha = 0.05, 0.00, 0.10` + comparador base). |
| **Ola 3 · `A7`** | `14 .. 17` | `holdout_registry_a7.jsonl` (`1..4`) | `walk_forward_dev` | `false` | `4` | `4` | Ensamble `Logit + HistGradientBoosting` (`allow_arb=True` y `allow_arb=False` vs Logit solo). |
| **Ola 3 · `A8`** | `18 .. 24` | `holdout_registry_a8.jsonl` (`1..7`) | `walk_forward_dev` | `false` | `7` | `7` | `4` configs OOF Doble Confirmación (`pm=0.010..0.020`) + `1` comparador `simple_sharp` + sensibilidad `alpha = 0.00, 0.10`. |
| **Ola 4 Pre-Holdout** | `25` | `evaluate_sealed_holdout_v3_1.py` | `walk_forward_dev` | `false` | `1` | `1` | Referencia integrada `v3.1` (`A4 + A5[12 segs] + A8[double_conf]`) en `walk_forward_dev` antes de abrir el sello (`25` configs previas acumuladas). |
| **Ola 4 Apertura Única** | `26 .. 29` | `evaluate_sealed_holdout_v3_1.py` | `holdout_sealed` | **`true`** | **`4`** | *(mismos 4 congelados)* | Evaluación **única sin re-tuning** sobre `holdout_sealed` de: (`26`) `baseline_v3_0`, (`27`) `pick_policy_v3_1` (`A4+A5`), (`28`) `stale_lines_a8` (`A8`), (`29`) `integrated_v3_1_a4_a5_a8` (`A4+A5+A8`). |

### 2.2 Transparencia sobre Rejillas Internas de Hiperparámetros en `walk_forward_dev`

Además de las `25` invocaciones a `run_backtest` previas al holdout, se documentan íntegramente los grados de libertad internos explorados dentro de `walk_forward_dev` (`< 2025-02-02T17:30:00Z`):
- **`A4` (`blend_calibration.py`):** `60` segmentos `liga × mercado` × `3` métodos de-vig (`proportional`, `power`, `shin`) × `21` pesos `w ∈ {0.00, 0.05, ..., 1.00}` = **`3,780` celdas walk-forward**, regularizadas con contracción empírica `w_shrunk = w_raw * n / (n + 300)` y filtro duro `w_effective > 0.05` + mejora causal OOS sobre `w = 0` (`48/60` apagados).
- **`A5` (`picks_engine.py`):** `3` configuraciones globales OOF (`wf_cfg1..3`) × rejilla de `8` umbrales `EV` (`0.018 .. 0.110`) por `60 × 4` celdas `liga × mercado × odds_bucket`, contraídos jerárquicamente hacia el prior del bucket con `m0 = 60`.
- **`A6` (`markets_2way.py`):** `92` segmentos `liga × mercado` de 2 vías × `21` pesos `w` = **`1,932` celdas** (`dc_rho` estimado por MLE causal por pliegue) $\rightarrow$ `0/92` activados.
- **`A7` (`export_gbm_ts.py`):** `5` pliegues causales con rejilla de temperatura `T` (`43` valores) y simplex de mezcla (`231` combinaciones) $\rightarrow$ `production_activated = false`.
- **`A8` (`stale_lines.py`):** `4` configuraciones globales OOF de margen/EV (`wf_dbl_pm010`, `wf_dbl_pm015`, `wf_dbl_pm020`, `wf_dbl_pm015_ev04`) frente al comparador `simple_sharp`.

> **Efecto de selección múltiple (Maldición del Ganador):** Incluso con contracción Bayesiana (`n0 = 300`, `m0 = 60`), seleccionar los `12` segmentos con mayor mejora aparente de `log-loss` entre `60` candidatos cuando el modelo estructural promedio pierde `+0.0146` nats ante Pinnacle introduce sesgo optimista en los segmentos cola (`SC1::ah`, `SC0::ah`). El `holdout_sealed` cumplió exactamente su función científica al detectar ese sobreajuste residual y bloquear el despliegue prematuro.

---

## 3. Línea Base `v3.0` (`walk_forward_dev` vs `holdout_sealed`)

Configuración congelada: `spacetime_v3.0+geodesic_v2.0` (`config_hash = 81f6f727369cbb9402f2d24ce26b9da245033324b1aeda1e22dcbac1a8516444`, commit `a852528`).

### 3.1 Calibración Probabilística Pareada (`1X2` Fútbol contra Cierre Pinnacle Sin Margen)

| Métrica | `walk_forward_dev` (`52,659` pareados de `56,649`) | `holdout_sealed` (`>= 2025-02-02T17:30Z`, `14,163` eventos) | Interpretación Estadística |
|---|---|---|---|
| `log_loss_model` [IC 95%] | `1.01137` `[1.00749, 1.01510]` | `1.00791` `[0.99706, 1.01795]` | Estable fuera de muestra (`-0.00346` nats). |
| `log_loss_closing_novig` [IC 95%] | `0.99680` `[0.99294, 1.00046]` | `0.99505` `[0.98371, 1.00563]` | Cierre sharp de Pinnacle como techo de eficiencia. |
| `Δ log_loss (modelo − cierre)` [IC 95%] | **`+0.01457`** `[+0.01315, +0.01601]` (**significativa**) | **`+0.01287`** `[+0.00910, +0.01667]` (**significativa**) | El modelo crudo pierde `~0.013–0.015` nats ante el cierre sharp tanto en `dev` como en `holdout`. |
| `brier_model` vs `brier_closing_novig` | `0.60549` vs `0.59564` | `0.60281` vs `0.59414` | Consistente con log-loss. |
| `Δ brier (modelo − cierre)` [IC 95%] | **`+0.00985`** `[+0.00890, +0.01086]` (**significativa**) | **`+0.00867`** `[+0.00614, +0.01121]` (**significativa**) | Brecha cuadrática estadísticamente significativa. |
| NFL `moneyline` (`closing_missing = 100%`) | `LL = 0.6244` (`n = 3,891`) | `LL = 0.6337` (`n = 271`) | `nflverse` carece de cierre Pinnacle identificable (`closing_missing=True`). |

### 3.2 Desempeño Económico de `Geodesic v2.0` (`delay = 2.0 min`, `alpha = 0.05`)

| Métrica | `walk_forward_dev` (`trial_seq = 1`) | `holdout_sealed` (`trial_seq = 26`) | Sensibilidad `dev` (`alpha = 0.00` / `0.10`) |
|---|---|---|---|
| Candidatos en decisión / llenados / no llenados | `2,288` / **`1,730`** / `558` | `172` / **`172`** / `0` | `1,730` llenados en ambos |
| Picks con cierre sharp válido (`n_clv` / `missing`) | `1,730` / `0` | `139` / `33` | `1,730` / `0` |
| Unidades apostadas / `PnL` neto | `6.88u` / `+0.22u` | `0.85u` / `-0.15u` | *(fracciones crudas sin escala 1u=1%)* |
| **`CLV%` medio [IC 95%]** | **`+1.03%`** `[+0.47%, +1.57%]` (`significativa_positiva`) | **`-0.71%`** `[-2.82%, +1.47%]` (**`"no significativa"`**) | `+1.41%` (`α=0.00`) / `+0.67%` (`α=0.10`) |
| **`CLV_prob` medio [IC 95%]** | **`+0.30 pp`** `[+0.17, +0.43 pp]` (`significativa_positiva`) | **`-0.08 pp`** `[-0.61, +0.49 pp]` (**`"no significativa"`**) | `+0.41 pp` / `+0.19 pp` |
| **`%CLV > 0`** [IC 95%] | `54.74%` `[52.20%, 57.11%]` | `46.04%` `[38.13%, 53.96%]` | — |
| **`ROI%` [IC 95%]** | **`+3.24%`** `[-5.59%, +12.42%]` (**`"no significativa"`**) | **`-17.97%`** `[-42.96%, +9.24%]` (**`"no significativa"`**) | `+3.57%` (`α=0.00`) / `+2.92%` (`α=0.10`), `"no significativa"` |
| `MaxDD` [IC 95%] | `0.32u` `[0.24u, 0.70u]` | `0.26u` `[0.14u, 0.43u]` | — |

---

## 4. Resultados por Fase: `walk_forward_dev` vs `holdout_sealed`

> **Convención estricta de inferencia:** Todo intervalo de confianza del 95% (`1,000` remuestreos bootstrap `mulberry32`) que cruce `0` se etiqueta explícitamente como **`"no significativa"`**.

### 4.1 Comparativa Maestra de las 4 Configuraciones Evaluadas

| Fase / Sistema | Split | `trial_seq` | Hash Config | Picks (`n / n_clv`) | Apostado (`u`) | `CLV%` [IC 95%] | `CLV_prob` [IC 95%] | `%CLV>0` | `ROI%` [IC 95%] | `MaxDD` (`u`) | Violaciones Topes |
|---|---|---:|---|---:|---:|---|---|---:|---|---:|---:|
| **Fase 0 · Línea Base `v3.0`** (`Geodesic v2.0`) | `dev` | `1` | `81f6f727369c` | `1,730 / 1,730` | `6.88u` | `+1.03% [+0.47%, +1.57%]` (`significativa_positiva`) | `+0.30 pp [+0.17, +0.43]` (`significativa_positiva`) | `54.74%` | `+3.24% [-5.59%, +12.42%]` (**`"no significativa"`**) | `0.32u` | N/A |
| **Fase 0 · Línea Base `v3.0`** (`Geodesic v2.0`) | **`holdout`** | **`26`** | `81f6f727369c` | `172 / 139` | `0.85u` | `-0.71% [-2.82%, +1.47%]` (**`"no significativa"`**) | `-0.08 pp [-0.61, +0.49]` (**`"no significativa"`**) | `46.04%` | `-17.97% [-42.96%, +9.24%]` (**`"no significativa"`**) | `0.26u` | N/A |
| **Fase 1 (Ola 2) · `A4 + A5`** (`pick_policy_v3_1`) | `dev` | `7`* | `42e358f26d00` | `185 / 184` | `260.65u` | `+4.97% [+2.82%, +7.35%]` (`significativa_positiva`) | `+1.42 pp [+0.67, +2.19]` (`significativa_positiva`) | `53.26%` | `+3.53% [-12.91%, +20.76%]` (**`"no significativa"`**) | `26.25u` | `0` |
| **Fase 1 (Ola 2) · `A4 + A5`** (`pick_policy_v3_1`) | **`holdout`** | **`27`** | `42e358f26d00` | `35 / 24` | `50.06u` | `-0.59% [-3.26%, +2.60%]` (**`"no significativa"`**) | `-0.74 pp [-1.93, +0.64]` (**`"no significativa"`**) | `33.33%` | `-1.42% [-32.95%, +35.21%]` (**`"no significativa"`**) | `8.75u` | `0` |
| **Fase 2a (Ola 3) · `A8`** (`stale_lines_a8`) | `dev` | `21`* | `06f461f5aa82` | `129 / 129` | `135.11u` | `+10.93% [+8.37%, +13.86%]` (`significativa_positiva`) | `+3.53 pp [+2.73, +4.45]` (`significativa_positiva`) | `83.72%` | `+5.30% [-17.98%, +33.14%]` (**`"no significativa"`**) | `19.06u` | `0` |
| **Fase 2a (Ola 3) · `A8`** (`stale_lines_a8`) | **`holdout`** | **`28`** | `815f29fd9e91` | `19 / 19` | `20.30u` | `-1.10% [-8.27%, +3.94%]` (**`"no significativa"`**) | `+0.09 pp [-2.26, +1.91]` (**`"no significativa"`**) | `57.89%` | `-19.86% [-60.54%, +23.25%]` (**`"no significativa"`**) | `5.27u` | `0` |
| **Fase 2b · Sistema Final Integrado `v3.1` (`A4+A5+A8`)** | `dev` | `25` | `5a6014110ada` | `243 / 242` | `292.21u` | `+4.96% [+3.11%, +7.01%]` (`significativa_positiva`) | `+1.35 pp [+0.75, +1.97]` (`significativa_positiva`) | `58.68%` | `-6.09% [-21.13%, +9.46%]` (**`"no significativa"`**) | `33.86u` | `0` |
| **Fase 2b · Sistema Final Integrado `v3.1` (`A4+A5+A8`)** | **`holdout`** | **`29`** | `5a6014110ada` | **`50 / 39`** | **`61.68u`** | **`-2.27% [-5.80%, +0.68%]`** (**`"no significativa"`**) | **`-0.94 pp [-2.05, +0.27]`** (**`"no significativa"`**) | **`38.46%`** | **`-4.23% [-32.85%, +24.27%]`** (**`"no significativa"`**) | **`9.88u`** | **`0`** |

*\*Nota de trazabilidad:* En `dev`, las corridas de reproducción determinista en `evaluate_sealed_holdout_v3_1.py` usan un registro efímero temporal para no inflar artificialmente `holdout_trial_registry.jsonl`, replicando exactamente los presets auditados en `trial_seq = 7` (`A5`) y `trial_seq = 21` (`A8`). Asimismo, en `A5` walk-forward causal OOF estricto (`wf_cfg3`, `trial_seq = 6`), `n = 224` obtuvo `CLV% = +4.62% [+2.63%, +6.67%]` (`significativa_positiva`) y `ROI% = +17.85% [+4.09%, +33.14%]` (`significativa_positiva`).

### 4.2 Desglose por Origen, Nivel (`solido` / `valor`), Fuente y Topes de Riesgo

#### A. Desglose por motor de origen (`by_origin`)

| Fase | Split | Subgrupo de Origen | Picks (`n`) | `CLV%` [IC 95%] | `ROI%` [IC 95%] | Lectura Cuantitativa |
|---|---|---|---:|---|---|---|
| **Fase 1 (`A4+A5`)** | `dev` | `a5_model_driven` | `120` | `-1.19% [-2.80%, +0.46%]` (**`"no significativa"`**) | `-14.50% [-32.80%, +5.08%]` (**`"no significativa"`**) | Los `12` segmentos con `w > 0.05` no baten al cierre sharp en ejecución real. |
| **Fase 1 (`A4+A5`)** | `dev` | `a5_sharp_arb` | `65` | `+16.25% [+12.14%, +21.16%]` (`significativa_positiva`) | `+36.13% [+6.29%, +66.55%]` (`significativa_positiva`) | Todo el alfa en `dev` proviene de líneas recreativas rezagadas frente a Pinnacle open. |
| **Fase 1 (`A4+A5`)** | **`holdout`** | `a5_model_driven` | `32` | `-2.95% [-4.89%, -0.85%]` (`significativa_negativa`) | `+2.23% [-32.05%, +39.27%]` (**`"no significativa"`**) | Confirma en holdout que el modelo tabular sin XI ni ticks vivos pierde CLV (`-2.95%`). |
| **Fase 1 (`A4+A5`)** | **`holdout`** | `a5_sharp_arb` | `3` | `+15.95% [+10.71%, +19.40%]` (`significativa_positiva`, `n=3`) | `-36.25% [-100.00%, +51.66%]` (**`"no significativa"`**) | Mantiene `+15.95%` CLV pero solo aparecen `3` casos en CSV `historical_fd` `2025–2026`. |
| **Fase 2b (`A4+A5+A8`)** | `dev` | `a5_model_driven` | `118` | `-1.27% [-2.87%, +0.42%]` (**`"no significativa"`**) | `-14.33% [-33.21%, +5.55%]` (**`"no significativa"`**) | Idéntico comportamiento pre-holdout. |
| **Fase 2b (`A4+A5+A8`)** | `dev` | `a8_stale_double_conf` | `125` | `+10.78% [+8.21%, +13.67%]` (`significativa_positiva`) | `+4.45% [-21.92%, +30.95%]` (**`"no significativa"`**) | Reemplaza el arbitraje simple con Doble Confirmación (`83.7%` `%CLV>0`). |
| **Fase 2b (`A4+A5+A8`)** | **`holdout`** | `a5_model_driven` | `31` | `-3.37% [-5.39%, -1.43%]` (`significativa_negativa`) | `+3.43% [-31.17%, +39.02%]` (**`"no significativa"`**) | Arrastra negativamente la media de CLV del portafolio integrado. |
| **Fase 2b (`A4+A5+A8`)** | **`holdout`** | `a8_stale_double_conf` | `19` | `-1.10% [-8.18%, +4.31%]` (**`"no significativa"`**) | `-19.86% [-59.57%, +25.52%]` (**`"no significativa"`**) | `57.89%` (`11/19`) de picks con `CLV > 0`, pero muestra pequeña (`n=19`) y cola adversa. |

#### B. Desglose por nivel de pick (`by_tier`: únicamente `solido` y `valor`)

| Fase | Split | Nivel | Picks (`n`) | `CLV%` [IC 95%] | `ROI%` [IC 95%] |
|---|---|---|---:|---|---|
| **Fase 1 (`A4+A5`)** | `dev` | `solido` | `30` | `+11.62% [+7.53%, +15.06%]` (`significativa_positiva`) | `+32.37% [-7.87%, +75.97%]` (**`"no significativa"`**) |
| **Fase 1 (`A4+A5`)** | `dev` | `valor` | `155` | `+3.68% [+1.22%, +6.40%]` (`significativa_positiva`) | `-1.62% [-20.03%, +16.37%]` (**`"no significativa"`**) |
| **Fase 1 (`A4+A5`)** | **`holdout`** | `solido` | `0` | — | — |
| **Fase 1 (`A4+A5`)** | **`holdout`** | `valor` | `35` | `-0.59% [-3.52%, +2.61%]` (**`"no significativa"`**) | `-1.42% [-34.68%, +33.09%]` (**`"no significativa"`**) |
| **Fase 2b (`A4+A5+A8`)** | `dev` | `solido` | `10` | `+5.80% [-0.08%, +11.38%]` (**`"no significativa"`**) | `-52.98% [-100.00%, +7.74%]` (**`"no significativa"`**) |
| **Fase 2b (`A4+A5+A8`)** | `dev` | `valor` | `233` | `+4.92% [+3.20%, +7.03%]` (`significativa_positiva`) | `-4.75% [-19.97%, +12.38%]` (**`"no significativa"`**) |
| **Fase 2b (`A4+A5+A8`)** | **`holdout`** | `solido` | `6` | **`+1.72% [-2.67%, +5.10%]`** (**`"no significativa"`**) | `-11.43% [-79.15%, +75.59%]` (**`"no significativa"`**) |
| **Fase 2b (`A4+A5+A8`)** | **`holdout`** | `valor` | `44` | `-2.99% [-6.90%, +0.29%]` (**`"no significativa"`**) | `-3.23% [-34.19%, +28.28%]` (**`"no significativa"`**) |

#### C. Resumen de Ola 3 (`A6`, `A7`, `A8`) y Auditoría de Topes de Portafolio

- **`A6` (Mercados 2-Vías Dixon-Coles puro, commit `732a403`):** Evaluó `92` segmentos (`23` ligas × `ah`, `totals`, `dnb`, `btts`) con liquidación asiática exacta de 5 estados. **`0 / 92` segmentos habilitados** en `walk_forward_dev` (se mantiene apagado en el sistema integrado `v3.1`).
- **`A7` (Exportación `HistGradientBoosting` a TypeScript, commits `6583954` + `dfbf2e4`):** Paridad `< 4.09 × 10^{-8}` sobre `4,785` partidos OOS y latencia `0.0446–0.0650 ms` (`< 0.1 ms`), pero en OOS `2024–2025` `Δlog_loss = -0.000221 [-0.001031, +0.000527]` (**`"no significativa"`**) y en picks guiados por modelo degrada `CLV%` en **`-1.46 pp [-2.70%, -0.29%]`** (`significativa_negativa`). Se mantiene `production_activated: false` y `src/domain/prediction/engine.ts` intacto.
- **Fuente de datos (`by_source`) y Topes Duros (`2u / 2u / 3u / 5u`):** El `100%` de los picks llenados en `dev` (`243/243`) y `holdout_sealed` (`50/50`) provino de `historical_fd` (`0` de `scraped_ws` bajo `execution_delay = 2.0 min`). Los 4 topes duros registraron en `holdout_sealed` máximos observados `[2.00u, 2.00u, 3.00u, 5.00u]` y `max_picks_per_event_market = 1`, con **`n_violations = 0`** en todas las fases.

---

## 5. Tabla Completa `liga × mercado` (`60` Segmentos en `walk_forward_dev` y `holdout_sealed`)

> **Leyenda de columnas:** `EV valor (S/E/P/L)` y `EV solido (S/E/P/L)` muestran los umbrales calibrados por bucket de cuota (`short [1.01,1.65)`, `even [1.65,2.20)`, `plus [2.20,2.90)`, `long [2.90,1000]`). `Picks (n / n_clv)` corresponde al **Sistema Integrado `v3.1` (`A4 + A5 + A8`)**. Todo IC 95% que cruza `0` está marcado como `"no significativa"`.

### 5.1 Tabla Completa `liga × mercado` en `walk_forward_dev` (`56,649` eventos `< 2025-02-02T17:30:00Z`, `60` segmentos)

> *Nota de signo en `ΔLL`:* `ΔLL = LL_mod − LL_close`; un valor `> 0` significa que el cierre sin margen de Pinnacle supera al modelo crudo (menor `log-loss`).

| Segmento | De-vig | `w_eff` | EV `valor` (`S/E/P/L`) | EV `solido` (`S/E/P/L`) | `n_par` | `LL_mod` | `LL_close` | `ΔLL (mod−close)` [IC 95%] | Picks (`n / n_clv`) | `ROI%` [IC 95%] | `CLV%` [IC 95%] | `CLV_prob` [IC 95%] | `%CLV>0` |
|---|---|---:|---|---|---:|---:|---:|---|---:|---|---|---|---:|
| `ARG::1x2` | `proportional` | `0.05` | `7.2/11.7/17.0/18.9%` | `3.9/6.5/9.6/10.8%` | 3005 | 1.0612 | 1.0458 | +0.0154 [+0.0089, +0.0225] (significativa) | 0 / 0 | — | — | — | — |
| `B1::1x2` | `power` | `0.00` | `7.2/10.7/17.0/18.9%` | `3.9/5.9/9.6/10.8%` | 1892 | 0.9968 | 0.9768 | +0.0200 [+0.0126, +0.0274] (significativa) | 14 / 14 | +32.02% [-20.69%, +79.85%] (no significativa) | +14.71% [+8.26%, +20.85%] (significativa_positiva) | +6.92 pp [+4.36, +9.50] (significativa_positiva) | 92.9% |
| `B1::ah` | `power` | `0.00` | `5.0/19.0/8.2/13.2%` | `2.4/10.8/4.3/7.1%` | 830 | 0.7071 | 0.6924 | +0.0147 [+0.0018, +0.0267] (significativa) | 1 / 1 | -100.00% [-100.00%, -100.00%] (no significativa) | -3.52% [-3.52%, -3.52%] (no significativa) | -1.68 pp [-1.68, -1.68] (no significativa) | 0.0% |
| `B1::totals` | `power` | `0.00` | `4.8/6.1/8.8/12.1%` | `2.4/3.1/4.6/6.6%` | 1651 | 0.6857 | 0.6733 | +0.0124 [+0.0055, +0.0199] (significativa) | 0 / 0 | — | — | — | — |
| `BRA::1x2` | `power` | `0.00` | `7.2/11.7/17.0/18.9%` | `3.9/6.5/9.6/10.8%` | 2660 | 1.0166 | 0.9928 | +0.0238 [+0.0157, +0.0314] (significativa) | 0 / 0 | — | — | — | — |
| `D1::1x2` | `proportional` | `0.05` | `7.2/11.7/17.0/18.9%` | `3.9/6.5/9.6/10.8%` | 2015 | 0.9798 | 0.9702 | +0.0097 [+0.0025, +0.0166] (significativa) | 2 / 2 | -100.00% [-100.00%, -100.00%] (significativa_negativa) | +6.09% [-1.49%, +13.68%] (no significativa) | +1.21 pp [-0.19, +2.61] (no significativa) | 50.0% |
| `D1::ah` | `power` | `0.00` | `5.0/19.0/8.2/13.2%` | `2.4/10.8/4.3/7.1%` | 998 | 0.7077 | 0.6896 | +0.0181 [+0.0067, +0.0302] (significativa) | 0 / 0 | — | — | — | — |
| `D1::totals` | `power` | `0.00` | `4.8/6.1/8.8/12.1%` | `2.4/3.1/4.6/6.6%` | 1668 | 0.6611 | 0.6453 | +0.0158 [+0.0093, +0.0221] (significativa) | 3 / 3 | -100.00% [-100.00%, -100.00%] (significativa_negativa) | +18.82% [+15.16%, +21.23%] (significativa_positiva) | +4.77 pp [+4.63, +4.92] (significativa_positiva) | 100.0% |
| `D2::1x2` | `proportional` | `0.35` | `7.2/8.3/12.4/19.2%` | `3.9/4.6/7.1/11.0%` | 2016 | 1.0512 | 1.0485 | +0.0027 [-0.0037, +0.0098] (no significativa) | 14 / 14 | -10.97% [-100.00%, +116.58%] (no significativa) | +4.23% [-4.13%, +14.65%] (no significativa) | +0.95 pp [-0.48, +2.76] (no significativa) | 57.1% |
| `D2::ah` | `power` | `0.35` | `5.0/19.2/8.2/13.2%` | `2.4/11.0/4.3/7.1%` | 1049 | 0.6954 | 0.6946 | +0.0008 [-0.0107, +0.0118] (no significativa) | 2 / 2 | -100.00% [-100.00%, -100.00%] (significativa_negativa) | +9.62% [+2.66%, +16.57%] (significativa_positiva) | +4.04 pp [+1.37, +6.71] (significativa_positiva) | 100.0% |
| `D2::totals` | `power` | `0.00` | `4.8/6.1/8.8/12.1%` | `2.4/3.1/4.6/6.6%` | 1710 | 0.6882 | 0.6715 | +0.0167 [+0.0108, +0.0228] (significativa) | 0 / 0 | — | — | — | — |
| `E0::1x2` | `power` | `0.00` | `7.2/11.7/17.0/18.9%` | `3.9/6.5/9.6/10.8%` | 2518 | 0.9603 | 0.9466 | +0.0137 [+0.0078, +0.0202] (significativa) | 2 / 2 | -18.85% [-100.00%, +238.94%] (no significativa) | +5.39% [+0.42%, +10.35%] (significativa_positiva) | +1.68 pp [+0.12, +3.24] (significativa_positiva) | 100.0% |
| `E0::ah` | `power` | `0.15` | `5.0/19.0/8.2/13.2%` | `2.4/10.8/4.3/7.1%` | 1254 | 0.7029 | 0.6934 | +0.0095 [-0.0025, +0.0214] (no significativa) | 0 / 0 | — | — | — | — |
| `E0::totals` | `power` | `0.05` | `4.8/6.1/8.8/12.1%` | `2.4/3.1/4.6/6.6%` | 2128 | 0.6782 | 0.6704 | +0.0078 [+0.0021, +0.0134] (significativa) | 2 / 2 | +7.34% [-100.00%, +222.36%] (no significativa) | +5.34% [-1.53%, +12.21%] (no significativa) | +1.67 pp [-0.45, +3.79] (no significativa) | 50.0% |
| `E1::1x2` | `shin` | `0.00` | `7.2/11.7/17.0/18.9%` | `3.9/6.5/9.6/10.8%` | 3669 | 1.0466 | 1.0351 | +0.0114 [+0.0068, +0.0161] (significativa) | 1 / 1 | -100.00% [-100.00%, -100.00%] (no significativa) | +2.86% [+2.86%, +2.86%] (no significativa) | +0.89 pp [+0.89, +0.89] (no significativa) | 100.0% |
| `E1::ah` | `power` | `0.20` | `5.0/19.0/8.2/13.2%` | `2.4/10.8/4.3/7.1%` | 2070 | 0.7006 | 0.6922 | +0.0084 [-0.0006, +0.0172] (no significativa) | 0 / 0 | — | — | — | — |
| `E1::totals` | `power` | `0.00` | `4.8/6.1/8.8/12.1%` | `2.4/3.1/4.6/6.6%` | 3117 | 0.6913 | 0.6819 | +0.0095 [+0.0047, +0.0139] (significativa) | 0 / 0 | — | — | — | — |
| `F1::1x2` | `shin` | `0.00` | `7.2/11.7/17.0/18.9%` | `3.9/6.5/9.6/10.8%` | 2284 | 1.0064 | 0.9923 | +0.0141 [+0.0081, +0.0208] (significativa) | 1 / 1 | -100.00% [-100.00%, -100.00%] (no significativa) | +86.76% [+86.76%, +86.76%] (no significativa) | +3.18 pp [+3.18, +3.18] (no significativa) | 100.0% |
| `F1::ah` | `power` | `0.15` | `5.0/19.0/8.2/13.2%` | `2.4/10.8/4.3/7.1%` | 1091 | 0.7071 | 0.6922 | +0.0149 [+0.0045, +0.0257] (significativa) | 1 / 1 | +93.15% [+93.15%, +93.15%] (no significativa) | -3.43% [-3.43%, -3.43%] (no significativa) | -1.77 pp [-1.77, -1.77] (no significativa) | 0.0% |
| `F1::totals` | `power` | `0.00` | `4.8/6.1/8.8/12.1%` | `2.4/3.1/4.6/6.6%` | 1900 | 0.6892 | 0.6732 | +0.0161 [+0.0099, +0.0226] (significativa) | 0 / 0 | — | — | — | — |
| `F2::1x2` | `power` | `0.20` | `7.2/11.7/17.0/18.9%` | `3.9/6.5/9.6/10.8%` | 2368 | 1.0521 | 1.0425 | +0.0096 [+0.0042, +0.0154] (significativa) | 6 / 6 | +21.31% [-100.00%, +110.88%] (no significativa) | +0.68% [-9.74%, +8.91%] (no significativa) | +0.79 pp [-2.31, +3.81] (no significativa) | 66.7% |
| `F2::ah` | `proportional` | `0.05` | `5.0/19.0/8.2/13.2%` | `2.4/10.8/4.3/7.1%` | 1174 | 0.7094 | 0.6949 | +0.0145 [+0.0032, +0.0248] (significativa) | 0 / 0 | — | — | — | — |
| `F2::totals` | `proportional` | `0.00` | `4.8/6.1/8.8/12.1%` | `2.4/3.1/4.6/6.6%` | 1986 | 0.6845 | 0.6734 | +0.0111 [+0.0052, +0.0161] (significativa) | 1 / 1 | -100.00% [-100.00%, -100.00%] (no significativa) | +3.78% [+3.78%, +3.78%] (no significativa) | +1.12 pp [+1.12, +1.12] (no significativa) | 100.0% |
| `G1::1x2` | `power` | `0.15` | `5.2/8.8/10.2/19.2%` | `2.9/4.9/5.8/11.0%` | 1581 | 0.9354 | 0.9205 | +0.0149 [+0.0059, +0.0239] (significativa) | 21 / 21 | +30.52% [-17.46%, +80.86%] (no significativa) | +4.71% [-0.98%, +9.85%] (no significativa) | +1.84 pp [-0.16, +3.81] (no significativa) | 66.7% |
| `G1::ah` | `power` | `0.35` | `5.0/19.2/8.2/13.2%` | `2.4/11.0/4.3/7.1%` | 669 | 0.6935 | 0.6873 | +0.0062 [-0.0094, +0.0224] (no significativa) | 1 / 1 | +108.40% [+108.40%, +108.40%] (no significativa) | +8.76% [+8.76%, +8.76%] (no significativa) | +4.21 pp [+4.21, +4.21] (no significativa) | 100.0% |
| `G1::totals` | `power` | `0.10` | `4.7/5.2/8.8/12.1%` | `2.4/2.7/4.6/6.6%` | 1339 | 0.6801 | 0.6718 | +0.0082 [+0.0014, +0.0150] (significativa) | 0 / 0 | — | — | — | — |
| `I1::1x2` | `power` | `0.00` | `7.2/11.7/17.0/18.9%` | `3.9/6.5/9.6/10.8%` | 2504 | 0.9715 | 0.9575 | +0.0140 [+0.0082, +0.0202] (significativa) | 0 / 0 | — | — | — | — |
| `I1::ah` | `proportional` | `0.20` | `5.0/12.0/8.2/13.2%` | `2.4/6.9/4.3/7.1%` | 1281 | 0.7042 | 0.6919 | +0.0123 [+0.0023, +0.0225] (significativa) | 0 / 0 | — | — | — | — |
| `I1::totals` | `shin` | `0.00` | `4.8/6.1/8.8/12.1%` | `2.4/3.1/4.6/6.6%` | 2123 | 0.6856 | 0.6751 | +0.0105 [+0.0050, +0.0158] (significativa) | 5 / 5 | +36.03% [-69.03%, +246.62%] (no significativa) | +11.36% [+8.50%, +14.51%] (significativa_positiva) | +3.42 pp [+2.37, +4.46] (significativa_positiva) | 100.0% |
| `I2::1x2` | `power` | `0.10` | `7.2/11.7/17.0/18.9%` | `3.9/6.5/9.6/10.8%` | 2472 | 1.0605 | 1.0446 | +0.0159 [+0.0098, +0.0228] (significativa) | 17 / 17 | -24.02% [-81.68%, +61.32%] (no significativa) | +10.83% [+6.50%, +16.27%] (significativa_positiva) | +3.44 pp [+2.10, +5.03] (significativa_positiva) | 94.1% |
| `I2::ah` | `power` | `0.25` | `5.0/12.0/8.2/13.2%` | `2.4/6.9/4.3/7.1%` | 1250 | 0.6944 | 0.6889 | +0.0055 [-0.0050, +0.0168] (no significativa) | 4 / 4 | -73.40% [-100.00%, +11.57%] (no significativa) | +2.71% [-0.57%, +5.99%] (no significativa) | +1.25 pp [-0.31, +2.87] (no significativa) | 75.0% |
| `I2::totals` | `proportional` | `0.05` | `4.8/6.1/8.8/12.1%` | `2.4/3.1/4.6/6.6%` | 2129 | 0.6914 | 0.6823 | +0.0091 [+0.0036, +0.0153] (significativa) | 0 / 0 | — | — | — | — |
| `JPN::1x2` | `shin` | `0.05` | `7.2/11.7/17.0/18.9%` | `3.9/6.5/9.6/10.8%` | 2299 | 1.0536 | 1.0390 | +0.0146 [+0.0070, +0.0221] (significativa) | 0 / 0 | — | — | — | — |
| `MEX::1x2` | `power` | `0.10` | `7.2/11.7/17.0/18.9%` | `3.9/6.5/9.6/10.8%` | 2175 | 1.0219 | 1.0107 | +0.0112 [+0.0047, +0.0179] (significativa) | 0 / 0 | — | — | — | — |
| `N1::1x2` | `power` | `0.00` | `7.2/11.7/17.0/18.9%` | `3.9/6.5/9.6/10.8%` | 1947 | 0.9367 | 0.9146 | +0.0220 [+0.0151, +0.0290] (significativa) | 3 / 3 | +94.29% [-100.00%, +193.35%] (no significativa) | +11.63% [-9.24%, +35.20%] (no significativa) | +3.77 pp [-4.62, +10.29] (no significativa) | 66.7% |
| `N1::ah` | `power` | `0.15` | `5.0/8.9/8.2/13.2%` | `2.4/5.1/4.3/7.1%` | 856 | 0.7025 | 0.6915 | +0.0110 [-0.0022, +0.0230] (no significativa) | 1 / 1 | -100.00% [-100.00%, -100.00%] (no significativa) | -14.21% [-14.21%, -14.21%] (no significativa) | -7.80 pp [-7.80, -7.80] (no significativa) | 0.0% |
| `N1::totals` | `power` | `0.00` | `4.8/6.1/8.8/12.1%` | `2.4/3.1/4.6/6.6%` | 1638 | 0.6737 | 0.6561 | +0.0175 [+0.0107, +0.0237] (significativa) | 0 / 0 | — | — | — | — |
| `NFL::moneyline` | `power` | `0.05` | `5.0/6.6/8.8/13.2%` | `2.4/3.3/4.6/7.1%` | 0 | 0.6244 | N/A | N/A (sin cierre sharp) | 0 / 0 | — | — | — | — |
| `NFL::spread` | `proportional` | `0.15` | `5.0/6.6/8.8/13.2%` | `2.4/3.3/4.6/7.1%` | 0 | 0.7046 | N/A | N/A (sin cierre sharp) | 0 / 0 | — | — | — | — |
| `NFL::totals` | `proportional` | `0.05` | `4.8/6.1/8.8/12.1%` | `2.4/3.1/4.6/6.6%` | 0 | 0.7108 | N/A | N/A (sin cierre sharp) | 0 / 0 | — | — | — | — |
| `P1::1x2` | `power` | `0.15` | `7.2/11.7/17.0/18.9%` | `3.9/6.5/9.6/10.8%` | 2011 | 0.9275 | 0.9189 | +0.0086 [+0.0017, +0.0153] (significativa) | 1 / 1 | -100.00% [-100.00%, -100.00%] (no significativa) | +11.93% [+11.93%, +11.93%] (no significativa) | +2.29 pp [+2.29, +2.29] (no significativa) | 100.0% |
| `P1::ah` | `power` | `0.25` | `5.0/15.3/8.2/13.2%` | `2.4/8.7/4.3/7.1%` | 940 | 0.6972 | 0.6913 | +0.0059 [-0.0071, +0.0175] (no significativa) | 0 / 0 | — | — | — | — |
| `P1::totals` | `proportional` | `0.00` | `4.8/6.1/8.8/12.1%` | `2.4/3.1/4.6/6.6%` | 1705 | 0.6877 | 0.6751 | +0.0126 [+0.0065, +0.0191] (significativa) | 0 / 0 | — | — | — | — |
| `SC0::1x2` | `power` | `0.00` | `7.2/11.7/17.0/18.9%` | `3.9/6.5/9.6/10.8%` | 1467 | 0.9338 | 0.9215 | +0.0123 [+0.0052, +0.0198] (significativa) | 0 / 0 | — | — | — | — |
| `SC0::ah` | `power` | `0.25` | `5.0/6.6/8.2/13.2%` | `2.4/3.7/4.3/7.1%` | 678 | 0.6932 | 0.6914 | +0.0018 [-0.0117, +0.0159] (no significativa) | 18 / 17 | -16.83% [-55.82%, +23.95%] (no significativa) | -2.47% [-4.06%, -0.89%] (significativa_negativa) | -1.29 pp [-2.13, -0.47] (significativa_negativa) | 35.3% |
| `SC0::totals` | `shin` | `0.00` | `4.8/6.1/8.8/12.1%` | `2.4/3.1/4.6/6.6%` | 1238 | 0.6824 | 0.6735 | +0.0089 [+0.0022, +0.0161] (significativa) | 0 / 0 | — | — | — | — |
| `SC1::1x2` | `proportional` | `0.00` | `7.2/11.7/17.0/18.9%` | `3.9/6.5/9.6/10.8%` | 1104 | 1.0672 | 1.0465 | +0.0207 [+0.0112, +0.0307] (significativa) | 1 / 1 | -100.00% [-100.00%, -100.00%] (no significativa) | +8.43% [+8.43%, +8.43%] (no significativa) | +1.78 pp [+1.78, +1.78] (no significativa) | 100.0% |
| `SC1::ah` | `proportional` | `0.30` | `5.0/5.8/8.2/13.2%` | `2.4/3.3/4.3/7.1%` | 555 | 0.7038 | 0.6864 | +0.0174 [-0.0010, +0.0374] (no significativa) | 75 / 75 | -12.50% [-33.60%, +9.15%] (no significativa) | -3.05% [-4.26%, -1.72%] (significativa_negativa) | -1.63 pp [-2.24, -0.99] (significativa_negativa) | 20.0% |
| `SC1::totals` | `proportional` | `0.00` | `4.8/6.1/8.8/12.1%` | `2.4/3.1/4.6/6.6%` | 924 | 0.6971 | 0.6817 | +0.0154 [+0.0074, +0.0230] (significativa) | 0 / 0 | — | — | — | — |
| `SP1::1x2` | `power` | `0.05` | `7.2/11.7/17.0/18.9%` | `3.9/6.5/9.6/10.8%` | 2497 | 0.9902 | 0.9785 | +0.0117 [+0.0054, +0.0181] (significativa) | 0 / 0 | — | — | — | — |
| `SP1::ah` | `power` | `0.15` | `5.0/19.0/8.2/13.2%` | `2.4/10.8/4.3/7.1%` | 1263 | 0.7022 | 0.6920 | +0.0103 [-0.0006, +0.0204] (no significativa) | 0 / 0 | — | — | — | — |
| `SP1::totals` | `power` | `0.00` | `4.8/6.1/8.8/12.1%` | `2.4/3.1/4.6/6.6%` | 2114 | 0.6752 | 0.6669 | +0.0083 [+0.0029, +0.0140] (significativa) | 0 / 0 | — | — | — | — |
| `SP2::1x2` | `proportional` | `0.15` | `7.2/10.7/16.5/18.9%` | `3.9/5.9/9.3/10.8%` | 3018 | 1.0528 | 1.0416 | +0.0112 [+0.0057, +0.0164] (significativa) | 38 / 38 | +27.70% [-25.83%, +84.96%] (no significativa) | +15.85% [+10.71%, +22.73%] (significativa_positiva) | +5.08 pp [+3.40, +7.22] (significativa_positiva) | 94.7% |
| `SP2::ah` | `power` | `0.30` | `5.0/15.1/8.2/13.2%` | `2.4/8.6/4.3/7.1%` | 1464 | 0.6972 | 0.6931 | +0.0041 [-0.0051, +0.0138] (no significativa) | 1 / 1 | -100.00% [-100.00%, -100.00%] (no significativa) | +0.42% [+0.42%, +0.42%] (no significativa) | +0.23 pp [+0.23, +0.23] (no significativa) | 100.0% |
| `SP2::totals` | `shin` | `0.00` | `4.8/6.1/8.8/12.1%` | `2.4/3.1/4.6/6.6%` | 2577 | 0.6698 | 0.6585 | +0.0113 [+0.0062, +0.0164] (significativa) | 0 / 0 | — | — | — | — |
| `SWE::1x2` | `power` | `0.00` | `7.2/11.7/17.0/18.9%` | `3.9/6.5/9.6/10.8%` | 1692 | 1.0055 | 0.9764 | +0.0291 [+0.0201, +0.0387] (significativa) | 0 / 0 | — | — | — | — |
| `T1::1x2` | `power` | `0.05` | `7.2/11.7/17.0/18.9%` | `3.9/6.5/9.6/10.8%` | 2301 | 1.0012 | 0.9851 | +0.0161 [+0.0091, +0.0231] (significativa) | 4 / 4 | +15.81% [-100.00%, +112.82%] (no significativa) | +2.41% [-7.51%, +12.32%] (no significativa) | +0.84 pp [-3.77, +5.45] (no significativa) | 50.0% |
| `T1::ah` | `proportional` | `0.15` | `5.0/19.0/8.2/13.2%` | `2.4/10.8/4.3/7.1%` | 1055 | 0.7070 | 0.6920 | +0.0150 [+0.0037, +0.0264] (significativa) | 1 / 1 | -100.00% [-100.00%, -100.00%] (no significativa) | +7.17% [+7.17%, +7.17%] (no significativa) | +3.43 pp [+3.43, +3.43] (no significativa) | 100.0% |
| `T1::totals` | `power` | `0.00` | `4.8/6.1/8.8/12.1%` | `2.4/3.1/4.6/6.6%` | 1995 | 0.6896 | 0.6748 | +0.0148 [+0.0091, +0.0201] (significativa) | 2 / 2 | -100.00% [-100.00%, -100.00%] (significativa_negativa) | -7.52% [-17.27%, +2.22%] (no significativa) | -4.36 pp [-9.91, +1.19] (no significativa) | 50.0% |
| `USA::1x2` | `proportional` | `0.00` | `7.2/11.7/17.0/18.9%` | `3.9/6.5/9.6/10.8%` | 3156 | 1.0328 | 1.0149 | +0.0179 [+0.0111, +0.0247] (significativa) | 0 / 0 | — | — | — | — |

### 5.2 Tabla Completa `liga × mercado` en `holdout_sealed` (`14,163` eventos `>= 2025-02-02T17:30:00Z`, `60` segmentos)

> *Nota de signo en `ΔLL`:* `ΔLL = LL_mod − LL_close`; `significativa_positiva` en `ΔLL` indica exceso positivo de `log-loss` del modelo frente a Pinnacle (el cierre sharp gana al modelo de forma estadísticamente significativa; en ningún segmento `ΔLL < 0` fue significativo en el holdout). Los umbrales `EV solido (S/E/P/L)` congelados son idénticos a la Tabla `5.1`.

| Segmento | De-vig | `w_eff` | EV `valor` (`S/E/P/L`) | `n_eval / n_par` | `LL_mod` | `LL_close` | `ΔLL (mod−close)` [IC 95%] | Picks (`n / n_clv`) | `ROI%` [IC 95%] | `CLV%` [IC 95%] | `CLV_prob` [IC 95%] | `%CLV>0` | `prod_enabled` | `disabled_reason` |
|---|---|---:|---|---:|---:|---:|---|---:|---|---|---|---|---|---|
| `ARG::1x2` | `proportional` | `0.05` | `7.2/11.7/17.0/18.9%` | 958 / 432 | 1.0690 | 1.0715 | -0.0024 [-0.0175, +0.0134] (no significativa) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `B1::1x2` | `power` | `0.00` | `7.2/10.7/17.0/18.9%` | 532 / 218 | 1.0012 | 0.9914 | +0.0099 [-0.0085, +0.0284] (no significativa) | 1 / 1 | -100.00% [-100.00%, -100.00%] (no significativa) | -2.54% [-2.54%, -2.54%] (no significativa) | -1.56 pp [-1.56, -1.56] (no significativa) | 0.0% | `false` | `holdout_clv_negative_or_zero` |
| `B1::ah` | `power` | `0.00` | `5.0/19.0/8.2/13.2%` | 490 / 119 | 0.6883 | 0.6921 | -0.0038 [-0.0375, +0.0310] (no significativa) | 1 / 1 | -100.00% [-100.00%, -100.00%] (no significativa) | +17.16% [+17.16%, +17.16%] (no significativa) | +8.60 pp [+8.60, +8.60] (no significativa) | 100.0% | `false` | `insufficient_holdout_sample_for_valid_ci95_n_lt_15` |
| `B1::totals` | `power` | `0.00` | `4.8/6.1/8.8/12.1%` | 532 / 218 | 0.7017 | 0.6819 | +0.0198 [-0.0011, +0.0412] (no significativa) | 1 / 1 | +51.66% [+51.66%, +51.66%] (no significativa) | +10.71% [+10.71%, +10.71%] (no significativa) | +7.07 pp [+7.07, +7.07] (no significativa) | 100.0% | `false` | `insufficient_holdout_sample_for_valid_ci95_n_lt_15` |
| `BRA::1x2` | `power` | `0.00` | `7.2/11.7/17.0/18.9%` | 718 / 336 | 0.9857 | 0.9734 | +0.0123 [-0.0098, +0.0321] (no significativa) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `D1::1x2` | `proportional` | `0.05` | `7.2/11.7/17.0/18.9%` | 513 / 275 | 1.0073 | 0.9938 | +0.0135 [-0.0019, +0.0308] (no significativa) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `D1::ah` | `power` | `0.00` | `5.0/19.0/8.2/13.2%` | 479 / 154 | 0.7122 | 0.6834 | +0.0288 [+0.0007, +0.0546] (significativa_positiva) | 1 / 1 | +49.87% [+49.87%, +49.87%] (no significativa) | +4.91% [+4.91%, +4.91%] (no significativa) | +2.46 pp [+2.46, +2.46] (no significativa) | 100.0% | `false` | `insufficient_holdout_sample_for_valid_ci95_n_lt_15` |
| `D1::totals` | `power` | `0.00` | `4.8/6.1/8.8/12.1%` | 513 / 266 | 0.6773 | 0.6572 | +0.0201 [+0.0006, +0.0372] (significativa_positiva) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `D2::1x2` | `proportional` | `0.35` | `7.2/8.3/12.4/19.2%` | 531 / 216 | 1.0384 | 1.0363 | +0.0021 [-0.0163, +0.0217] (no significativa) | 0 / 0 | — | — | — | — | `false` | `zero_holdout_picks_emitted` |
| `D2::ah` | `power` | `0.35` | `5.0/19.2/8.2/13.2%` | 498 / 109 | 0.7249 | 0.6914 | +0.0335 [-0.0036, +0.0711] (no significativa) | 0 / 0 | — | — | — | — | `false` | `zero_holdout_picks_emitted` |
| `D2::totals` | `power` | `0.00` | `4.8/6.1/8.8/12.1%` | 531 / 216 | 0.7033 | 0.6841 | +0.0191 [-0.0036, +0.0400] (no significativa) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `E0::1x2` | `power` | `0.00` | `7.2/11.7/17.0/18.9%` | 622 / 352 | 0.9873 | 0.9677 | +0.0196 [+0.0032, +0.0357] (significativa_positiva) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `E0::ah` | `power` | `0.15` | `5.0/19.0/8.2/13.2%` | 576 / 195 | 0.7171 | 0.6948 | +0.0224 [-0.0080, +0.0572] (no significativa) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `E0::totals` | `power` | `0.05` | `4.8/6.1/8.8/12.1%` | 622 / 351 | 0.6925 | 0.6881 | +0.0044 [-0.0112, +0.0199] (no significativa) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `E1::1x2` | `shin` | `0.00` | `7.2/11.7/17.0/18.9%` | 925 / 464 | 1.0484 | 1.0392 | +0.0092 [-0.0050, +0.0231] (no significativa) | 1 / 1 | -100.00% [-100.00%, -100.00%] (no significativa) | +7.73% [+7.73%, +7.73%] (no significativa) | +2.21 pp [+2.21, +2.21] (no significativa) | 100.0% | `false` | `insufficient_holdout_sample_for_valid_ci95_n_lt_15` |
| `E1::ah` | `power` | `0.20` | `5.0/19.0/8.2/13.2%` | 864 / 296 | 0.6909 | 0.6861 | +0.0049 [-0.0157, +0.0253] (no significativa) | 2 / 2 | +92.89% [+92.47%, +93.34%] (significativa_positiva) | +5.35% [+4.20%, +6.51%] (significativa_positiva) | +2.77 pp [+2.18, +3.37] (significativa_positiva) | 100.0% | `false` | `insufficient_holdout_sample_for_valid_ci95_n_lt_15` |
| `E1::totals` | `power` | `0.00` | `4.8/6.1/8.8/12.1%` | 925 / 464 | 0.6972 | 0.6858 | +0.0114 [+0.0016, +0.0216] (significativa_positiva) | 2 / 2 | -18.62% [-100.00%, +79.64%] (no significativa) | -0.47% [-5.83%, +4.90%] (no significativa) | +0.13 pp [-2.46, +2.73] (no significativa) | 50.0% | `false` | `holdout_clv_negative_or_zero` |
| `F1::1x2` | `shin` | `0.00` | `7.2/11.7/17.0/18.9%` | 523 / 280 | 0.9579 | 0.9464 | +0.0116 [-0.0096, +0.0329] (no significativa) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `F1::ah` | `power` | `0.15` | `5.0/19.0/8.2/13.2%` | 492 / 141 | 0.6924 | 0.6924 | +0.0000 [-0.0294, +0.0286] (no significativa) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `F1::totals` | `power` | `0.00` | `4.8/6.1/8.8/12.1%` | 523 / 277 | 0.6946 | 0.6686 | +0.0260 [+0.0063, +0.0440] (significativa_positiva) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `F2::1x2` | `power` | `0.20` | `7.2/11.7/17.0/18.9%` | 530 / 216 | 1.0682 | 1.0524 | +0.0157 [-0.0097, +0.0409] (no significativa) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `F2::ah` | `proportional` | `0.05` | `5.0/19.0/8.2/13.2%` | 488 / 120 | 0.6994 | 0.6926 | +0.0068 [-0.0317, +0.0514] (no significativa) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `F2::totals` | `proportional` | `0.00` | `4.8/6.1/8.8/12.1%` | 530 / 216 | 0.6899 | 0.6763 | +0.0136 [-0.0043, +0.0332] (no significativa) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `G1::1x2` | `power` | `0.15` | `5.2/8.8/10.2/19.2%` | 394 / 144 | 0.9651 | 0.9535 | +0.0115 [-0.0175, +0.0433] (no significativa) | 1 / 1 | +522.29% [+522.29%, +522.29%] (no significativa) | +7.06% [+7.06%, +7.06%] (no significativa) | +1.13 pp [+1.13, +1.13] (no significativa) | 100.0% | `false` | `insufficient_holdout_sample_for_valid_ci95_n_lt_15` |
| `G1::ah` | `power` | `0.35` | `5.0/19.2/8.2/13.2%` | 371 / 73 | 0.6932 | 0.6882 | +0.0050 [-0.0312, +0.0461] (no significativa) | 0 / 0 | — | — | — | — | `false` | `zero_holdout_picks_emitted` |
| `G1::totals` | `power` | `0.10` | `4.7/5.2/8.8/12.1%` | 394 / 144 | 0.6944 | 0.6986 | -0.0042 [-0.0252, +0.0167] (no significativa) | 1 / 1 | +100.39% [+100.39%, +100.39%] (no significativa) | -6.65% [-6.65%, -6.65%] (no significativa) | -3.32 pp [-3.32, -3.32] (no significativa) | 0.0% | `false` | `holdout_clv_negative_or_zero` |
| `I1::1x2` | `power` | `0.00` | `7.2/11.7/17.0/18.9%` | 644 / 352 | 0.9869 | 0.9687 | +0.0182 [+0.0029, +0.0350] (significativa_positiva) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `I1::ah` | `proportional` | `0.20` | `5.0/12.0/8.2/13.2%` | 587 / 223 | 0.7238 | 0.6923 | +0.0316 [+0.0063, +0.0594] (significativa_positiva) | 0 / 0 | — | — | — | — | `false` | `zero_holdout_picks_emitted` |
| `I1::totals` | `shin` | `0.00` | `4.8/6.1/8.8/12.1%` | 644 / 352 | 0.6933 | 0.6877 | +0.0057 [-0.0082, +0.0200] (no significativa) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `I2::1x2` | `power` | `0.10` | `7.2/11.7/17.0/18.9%` | 630 / 230 | 1.0755 | 1.0517 | +0.0238 [+0.0016, +0.0448] (significativa_positiva) | 1 / 1 | -100.00% [-100.00%, -100.00%] (no significativa) | -14.72% [-14.72%, -14.72%] (no significativa) | -4.88 pp [-4.88, -4.88] (no significativa) | 0.0% | `false` | `holdout_clv_negative_or_zero` |
| `I2::ah` | `power` | `0.25` | `5.0/12.0/8.2/13.2%` | 578 / 134 | 0.6767 | 0.6881 | -0.0114 [-0.0455, +0.0238] (no significativa) | 3 / 3 | -27.47% [-100.00%, +28.98%] (no significativa) | -8.65% [-14.21%, -3.66%] (significativa_negativa) | -4.82 pp [-7.94, -1.88] (significativa_negativa) | 0.0% | `false` | `holdout_clv_negative_or_zero` |
| `I2::totals` | `proportional` | `0.05` | `4.8/6.1/8.8/12.1%` | 630 / 230 | 0.7161 | 0.6999 | +0.0162 [-0.0010, +0.0325] (no significativa) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `JPN::1x2` | `shin` | `0.05` | `7.2/11.7/17.0/18.9%` | 510 / 370 | 1.0404 | 1.0299 | +0.0105 [-0.0088, +0.0304] (no significativa) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `MEX::1x2` | `power` | `0.10` | `7.2/11.7/17.0/18.9%` | 598 / 263 | 0.9469 | 0.9419 | +0.0050 [-0.0142, +0.0235] (no significativa) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `N1::1x2` | `power` | `0.00` | `7.2/11.7/17.0/18.9%` | 535 / 263 | 0.9643 | 0.9458 | +0.0185 [+0.0009, +0.0353] (significativa_positiva) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `N1::ah` | `power` | `0.15` | `5.0/8.9/8.2/13.2%` | 492 / 129 | 0.7213 | 0.6915 | +0.0298 [-0.0049, +0.0659] (no significativa) | 0 / 0 | — | — | — | — | `false` | `zero_holdout_picks_emitted` |
| `N1::totals` | `power` | `0.00` | `4.8/6.1/8.8/12.1%` | 535 / 263 | 0.6763 | 0.6721 | +0.0042 [-0.0112, +0.0197] (no significativa) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `NFL::moneyline` | `power` | `0.05` | `5.0/6.6/8.8/13.2%` | 271 / 0 | 0.6337 | N/A | N/A (sin cierre sharp) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `NFL::spread` | `proportional` | `0.15` | `5.0/6.6/8.8/13.2%` | 271 / 0 | 0.7197 | N/A | N/A (sin cierre sharp) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `NFL::totals` | `proportional` | `0.05` | `4.8/6.1/8.8/12.1%` | 272 / 0 | 0.7185 | N/A | N/A (sin cierre sharp) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `P1::1x2` | `power` | `0.15` | `7.2/11.7/17.0/18.9%` | 534 / 283 | 0.8962 | 0.8956 | +0.0007 [-0.0150, +0.0176] (no significativa) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `P1::ah` | `power` | `0.25` | `5.0/15.3/8.2/13.2%` | 487 / 151 | 0.6847 | 0.6950 | -0.0103 [-0.0373, +0.0197] (no significativa) | 0 / 0 | — | — | — | — | `false` | `zero_holdout_picks_emitted` |
| `P1::totals` | `proportional` | `0.00` | `4.8/6.1/8.8/12.1%` | 534 / 283 | 0.6620 | 0.6508 | +0.0113 [-0.0038, +0.0255] (no significativa) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `SC0::1x2` | `power` | `0.00` | `7.2/11.7/17.0/18.9%` | 382 / 134 | 1.0277 | 1.0278 | -0.0000 [-0.0231, +0.0250] (no significativa) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `SC0::ah` | `power` | `0.25` | `5.0/6.6/8.2/13.2%` | 365 / 77 | 0.7114 | 0.6932 | +0.0182 [-0.0204, +0.0613] (no significativa) | 4 / 2 | +24.49% [-76.40%, +108.19%] (no significativa) | -0.75% [-7.02%, +5.53%] (no significativa) | -0.30 pp [-3.34, +2.73] (no significativa) | 50.0% | `false` | `holdout_clv_negative_or_zero` |
| `SC0::totals` | `shin` | `0.00` | `4.8/6.1/8.8/12.1%` | 382 / 134 | 0.6919 | 0.6834 | +0.0085 [-0.0142, +0.0331] (no significativa) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `SC1::1x2` | `proportional` | `0.00` | `7.2/11.7/17.0/18.9%` | 317 / 128 | 1.0756 | 1.0510 | +0.0246 [-0.0043, +0.0528] (no significativa) | 1 / 1 | +268.37% [+268.37%, +268.37%] (no significativa) | +6.99% [+6.99%, +6.99%] (no significativa) | +1.90 pp [+1.90, +1.90] (no significativa) | 100.0% | `false` | `insufficient_holdout_sample_for_valid_ci95_n_lt_15` |
| `SC1::ah` | `proportional` | `0.30` | `5.0/5.8/8.2/13.2%` | 294 / 76 | 0.7471 | 0.6780 | +0.0691 [+0.0080, +0.1338] (significativa_positiva) | 24 / 15 | -22.16% [-56.50%, +11.49%] (no significativa) | -3.59% [-4.90%, -2.30%] (significativa_negativa) | -1.90 pp [-2.59, -1.22] (significativa_negativa) | 13.3% | `false` | `holdout_clv_negative_or_zero` |
| `SC1::totals` | `proportional` | `0.00` | `4.8/6.1/8.8/12.1%` | 317 / 128 | 0.6960 | 0.6685 | +0.0275 [+0.0044, +0.0514] (significativa_positiva) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `SP1::1x2` | `power` | `0.05` | `7.2/11.7/17.0/18.9%` | 662 / 351 | 0.9359 | 0.9279 | +0.0081 [-0.0057, +0.0211] (no significativa) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `SP1::ah` | `power` | `0.15` | `5.0/19.0/8.2/13.2%` | 614 / 216 | 0.7117 | 0.6965 | +0.0152 [-0.0132, +0.0410] (no significativa) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `SP1::totals` | `power` | `0.00` | `4.8/6.1/8.8/12.1%` | 662 / 351 | 0.6859 | 0.6718 | +0.0141 [-0.0000, +0.0292] (no significativa) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `SP2::1x2` | `proportional` | `0.15` | `7.2/10.7/16.5/18.9%` | 792 / 390 | 1.0470 | 1.0314 | +0.0156 [-0.0005, +0.0321] (no significativa) | 2 / 2 | -100.00% [-100.00%, -100.00%] (significativa_negativa) | -1.81% [-4.84%, +1.21%] (no significativa) | -0.58 pp [-1.51, +0.35] (no significativa) | 50.0% | `false` | `holdout_clv_negative_or_zero` |
| `SP2::ah` | `power` | `0.30` | `5.0/15.1/8.2/13.2%` | 737 / 240 | 0.6978 | 0.6856 | +0.0122 [-0.0126, +0.0408] (no significativa) | 2 / 2 | +96.21% [+83.00%, +109.42%] (significativa_positiva) | +0.28% [-2.21%, +2.77%] (no significativa) | +0.06 pp [-1.21, +1.32] (no significativa) | 50.0% | `false` | `holdout_clv_ci95_crosses_zero` |
| `SP2::totals` | `shin` | `0.00` | `4.8/6.1/8.8/12.1%` | 792 / 390 | 0.6962 | 0.6789 | +0.0174 [+0.0037, +0.0315] (significativa_positiva) | 1 / 1 | -100.00% [-100.00%, -100.00%] (no significativa) | +5.40% [+5.40%, +5.40%] (no significativa) | +1.55 pp [+1.55, +1.55] (no significativa) | 100.0% | `false` | `insufficient_holdout_sample_for_valid_ci95_n_lt_15` |
| `SWE::1x2` | `power` | `0.00` | `7.2/11.7/17.0/18.9%` | 456 / 224 | 1.0203 | 0.9902 | +0.0300 [+0.0031, +0.0572] (significativa_positiva) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `T1::1x2` | `power` | `0.05` | `7.2/11.7/17.0/18.9%` | 550 / 280 | 0.9576 | 0.9364 | +0.0212 [-0.0003, +0.0423] (no significativa) | 1 / 1 | -100.00% [-100.00%, -100.00%] (no significativa) | -49.93% [-49.93%, -49.93%] (no significativa) | -13.12 pp [-13.12, -13.12] (no significativa) | 0.0% | `false` | `holdout_clv_negative_or_zero` |
| `T1::ah` | `proportional` | `0.15` | `5.0/19.0/8.2/13.2%` | 515 / 136 | 0.7379 | 0.6916 | +0.0462 [+0.0113, +0.0785] (significativa_positiva) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `T1::totals` | `power` | `0.00` | `4.8/6.1/8.8/12.1%` | 550 / 280 | 0.6844 | 0.6510 | +0.0333 [+0.0152, +0.0521] (significativa_positiva) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |
| `USA::1x2` | `proportional` | `0.00` | `7.2/11.7/17.0/18.9%` | 1035 / 525 | 1.0473 | 1.0268 | +0.0205 [+0.0067, +0.0345] (significativa_positiva) | 0 / 0 | — | — | — | — | `false` | `disabled_in_dev_and_zero_holdout_stale_picks` |

---

## 6. Mercados y Componentes Desactivados y Sus Causas Empíricas

La arquitectura `v3.1` aplica apagado automático basado en evidencia causal en cuatro capas sucesivas:

### 6.1 Capa 1 (`A4` · Mezcla Logit Modelo-Mercado, commit `5b3df2c`): `48 / 60` Segmentos Apagados en `dev`
- **`35` segmentos** por `model_weight_near_zero_w_le_0_05`: el peso óptimo contraído `w_effective <= 0.05` demuestra que la cuota sharp de apertura ya subsume la información de las features tabulares (incluye las `6` ligas Extra `ARG, BRA, JPN, MEX, SWE, USA` y la mayoría de `1X2`/`totals` de ligas Big-5).
- **`10` segmentos** por `walk_forward_causal_blend_does_not_beat_open_market_novig`: aunque en pliegues individuales `w_effective > 0.05`, la mezcla OOS causal no supera a `w = 0` (`open_market_novig`).
- **`3` segmentos NFL** (`NFL::moneyline`, `NFL::spread`, `NFL::totals`) por `insufficient_sharp_closing_benchmark`: `nflverse` publica una línea de consenso sin identificar casa sharp (`closing_missing = 100%` en `6,986` partidos), por lo que está prohibido asumir ventaja frente a cierre sharp.

### 6.2 Capa 2 (`A6` · Mercados 2-Vías Dixon-Coles Puro, commit `732a403`): `92 / 92` Segmentos Apagados
- **`46` segmentos** (`23 dnb` + `23 btts`): ausencia de histórico liquidado (`scraped_ws` solo tiene `112` filas prospectivas en `3` eventos).
- **`12` segmentos** (`6` ligas Extra × `ah` y `totals`): `0` filas históricas en `football-data.co.uk`.
- **`31` segmentos**: apagados previamente por `A4` (`w_effective <= 0.05`).
- **`2` segmentos** (`D2::ah`, `G1::ah`): la matriz Dixon-Coles pura pierde en `log-loss` OOS causal frente a `open_novig`.
- **`1` segmento** (`G1::totals`, `w_eff = 0.10`, `ΔLL = -0.000516`): emite **`0` picks OOS ejecutables** (`< 5`) bajo retraso `2 min` y umbrales `A5`.

### 6.3 Capa 3 (`A7` · Árboles `HistGradientBoosting` en TypeScript, commits `6583954` + `dfbf2e4`): `production_activated: false`
- El *tree-walker* nativo en TypeScript (`src/domain/prediction/gbm.ts`) cumple paridad `< 4.09 × 10^{-8}` sobre los `4,785` partidos OOS y latencia `< 0.065 ms`, quedando listo como infraestructura reutilizable.
- Sin embargo, en validación OOS reciente `2024–2025` (`n = 4,785`), `Δlog_loss = -0.000221 [-0.001031, +0.000527]` (**`"no significativa"`**), y al medir picks guiados exclusivamente por modelo (`allow_pure_market_arb = false`) aparece una **paradoja de composición**: `Logit+GBM` encoge la dispersión de probabilidades extremas, apaga `3` de los `4` segmentos activos y degrada `CLV%` de `+0.61%` (`n = 271`) a **`-0.85%` (`n = 180`), `ΔCLV% = -1.46 pp [-2.70%, -0.29%]`** (`significativa_negativa`). Por ello `production_activated = false` y `src/domain/prediction/engine.ts` permanece intacto.

### 6.4 Capa 4 (`A10` · Puerta Final de Holdout Sellado): `60 / 60` Segmentos Apagados en `production_segments_v3_1.json`

Al exigir `CLV% > 0` con IC 95% bootstrap válido (`n_clv >= 15`) que no cruce `0` en `holdout_sealed`, los `60` segmentos quedan clasificados con total trazabilidad en `src/data/prediction/production_segments_v3_1.json`:

| Motivo de Apagado (`disabled_reason`) | Conteo | Segmentos |
|---|---:|---|
| `disabled_in_dev_and_zero_holdout_stale_picks` | **`36`** | Segmentos apagados en `A4` (`dev_model_picks_enabled = false`) que tampoco emitieron ningún pick de línea rezagada `A8` en el holdout (incluye los `3` mercados NFL, las `6` ligas Extra y `27` segmentos europeos). |
| `holdout_clv_negative_or_zero` | **`9`** | `B1::1x2` (`n=1, -2.54%`), `E1::totals` (`n=2, -0.47%`), `G1::totals` (`n=1, -6.65%`), `I2::1x2` (`n=1, -14.72%`), `I2::ah` (`n=3, -8.65%`), `SC0::ah` (`n=4 / n_clv=2, -0.75%`), `SC1::ah` (`n=24 / n_clv=15, -3.59%`), `SP2::1x2` (`n=2, -1.81%`), `T1::1x2` (`n=1, -49.93%`). |
| `insufficient_holdout_sample_for_valid_ci95_n_lt_15` | **`8`** | Segmentos con `CLV% > 0` puntual pero muestra `1 <= n_clv <= 2 < 15`: `B1::ah` (`n=1, +17.16%`), `B1::totals` (`n=1, +10.71%`), `D1::ah` (`n=1, +4.91%`), `E1::1x2` (`n=1, +7.73%`), `E1::ah` (`n=2, +5.35%`), `G1::1x2` (`n=1, +7.06%`), `SC1::1x2` (`n=1, +6.99%`), `SP2::totals` (`n=1, +5.40%`). |
| `zero_holdout_picks_emitted` | **`6`** | Segmentos habilitados en `dev` por `A4` que emitieron `0` picks en el holdout: `D2::1x2`, `D2::ah`, `G1::ah`, `I1::ah`, `N1::ah`, `P1::ah`. |
| `holdout_clv_ci95_crosses_zero` | **`1`** | `SP2::ah` (`n=2, CLV% = +0.28% [-2.21%, +2.77%]`, `"no significativa"`). |
| **Total** | **`60`** | **`0` habilitados en producción (`production_enabled: true = 0`)**. |

---

## 7. Frecuencia Empírica de Scraping (`A8`) y Límites Actuales de `scraped_ws`

### 7.1 Cadencia Óptima Derivada Matemáticamente (`exponential_stale_window_nyquist_v1`, commit `700dd24`)

En lugar de intervalos arbitrarios (`15–20 min`), `services/models/stale_lines.py` calibró la tasa efectiva de decaimiento de discrepancias $\lambda_{\text{eff}}(H)$ combinando la probabilidad observada de movimiento sharp ($p_{\text{move}} = 68/326 = 20.86\%$ en $G_{\text{sharp}} = 78.7833\text{ min}$) y el coeficiente empírico de convergencia recreativa hacia Pinnacle ($\beta_{\text{conv}} = 0.5656$ sobre $114,037$ selecciones de `walk_forward_dev`), imponiendo pérdida máxima de muestreo $\alpha_{\text{poll}} = 0.05$ ($x^* = 0.103479$):

| Régimen Operativo | Horizonte al Kickoff ($H$) | $\lambda_{\text{eff}}(H)$ ($\text{min}^{-1}$) | Vida Media del Edge ($\ln 2 / \lambda_{\text{eff}}$) | Intervalo Recomendado ($\Delta t^*$) | Supervivencia del Edge con $\Delta t^*$ | Supervivencia al Intervalo Actual (`78.78 min`) |
|---|---:|---:|---:|---:|---:|---:|
| **Ventana crítica pre-partido (XI oficial)** | **`60.0 min` (`T-60m`)** | `0.02807` | `24.69 min` | **`3.69 min` (`221.2 s`)** | **`89.81%`** | `38.06%` (`+51.75 pp` al pasar a `3.69m`) |
| **Matchday cercano (`q00_ws`)** | **`262.4 min` (`~4.4 h`)** | `0.01207` | `57.41 min` | **`8.57 min` (`514.3 s`)** | **`92.73%`** | `63.64%` |
| **Matchday estándar (`q10_ws`)** | **`509.9 min` (`~8.5 h`)** | `0.00885` | `78.32 min` | **`11.69 min` (`701.5 s`)** | **`93.33%`** | `72.02%` |
| **Apertura semanal (`q50_ws`)** | **`6,269.9 min` (`~4.35 d`)** | `0.00340` | `203.65 min` | **`30.40 min` (`1,823.9 s`)** | **`94.36%`** | `87.98%` |

### 7.2 Límites Reales de Datos en el Lote Actual de `scraped_ws` (`odds_snapshots.parquet`)

La auditoría directa sobre las `11,028` filas válidas pre-kickoff de `scraped_ws` (`109` eventos, capturados entre `2026-11-09` y `2026-11-10`) documenta cuatro cuellos de botella operativos que explican por qué `scraped_ws` produjo **`0` fills ejecutables** bajo `execution_delay_minutes = 2.0`:

1. **Resolución temporal insuficiente en el ancla sharp (`Pinnacle` / `Smarkets`):** `pinnacle` cuenta únicamente con `1,028` filas en `13` eventos NFL distribuidas en **2 olas** (`2026-11-09T18:46:13Z` y `20:05:00Z`, brecha mediana `78.78 min`), mientras que `smarkets` tiene **`0` filas válidas** en el Parquet consolidado.
2. **Captura única (`single_capture_only = true`) y descruce en casas mexicanas objetivo:** `caliente` apenas registra `3` filas válidas (`1` evento de fútbol sin par contemporáneo en `pinnacle`) y `codere` registra **`0` filas válidas**.
3. **Desfase inter-día en skins recreativas US (`DraftKings`/`FanDuel`/`BetMGM` NJ):** Las `7` discrepancias brutas donde una skin recreativa quedó por encima de la probabilidad sin margen de Pinnacle ocurrieron en la captura única del `2026-11-10T16:00:06Z` (`+1,195.10` a `+1,273.88 min` después del último tick de Pinnacle), siendo bloqueadas legítimamente tanto por la guardia de frescura sharp (`max_sharp_age <= 180 min`) como por ausencia de segundo tick post-retardo (`unfilled_no_post_delay_tick`).
4. **Requisito bloqueante para reactivar segmentos en producción:** Operar el recolector en `.worktrees/web-scraping` de forma continua sobre **`Pinnacle` + `Smarkets` + `Caliente` + `Codere` + `Bet365`** respetando los intervalos $\Delta t^*(H)$ (`<= 3.69 min` en `[T-60m, T-0]`), acumular al menos `>= 150` picks prospectivos registrados en el `PickLedger` inmutable (`A2`) con cierre sharp verificado (`A1`) y exigir `CLV% > 0` con IC 95% bootstrap `> 0` antes de cambiar cualquier `production_enabled` a `true`.
