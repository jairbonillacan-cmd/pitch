# 04 — Arquitectura de motores e integración

**Documento:** arquitectura real del laboratorio y del motor desplegado, con los contratos y la integración TypeScript.
**Fecha:** 2026-11-09 · **Autor:** SUBAGENTE 11 — DOCUMENTATION & REPRODUCIBILITY · **Commit:** `a680a4f`.
**Fuentes:** [`A06_motor_a_experiments.md`](../../research/prediction-lab/reports/A06_motor_a_experiments.md) · [`A07_market_intelligence.md`](../../research/prediction-lab/reports/A07_market_intelligence.md) · [`A10_integration.md`](../../research/prediction-lab/reports/A10_integration.md) · [`FREEZE.md`](../../research/prediction-lab/artifacts/FREEZE.md) · [`FINAL/eval_test/metrics.md`](../../research/prediction-lab/artifacts/FINAL/eval_test/metrics.md).

> **Estado:** Motor A desplegado = **regresión logística multinomial** (`motor_a_logistic_v1`, v1.0.0), exportada a JSON y verificada en TypeScript con paridad **4,997×10⁻¹³**. Motor B = **de-vig *power* sobre apertura** (operable), **no** un clasificador. El *stacking* de Motor B se evaluó y **no se adoptó**. El mercado gana por **0,0188–0,0203** de log-loss en test.

---

## 1. Vista de componentes

```
data/raw/*.csv (football-data, 465 archivos)
   │  etl/download_football_data.py
   ▼
data/processed/matches.parquet        182.414 × 88
   │  features/build_features.py
   ▼
data/processed/features.parquet       182.410 × 198   (causales)
   │  features/build_market_features.py
   ▼
data/processed/features_market.parquet 182.410 × 192  (de-vig)
   │
   ├─ models/a/train_motor_a.py ──► artifacts/EXP01_final_20261109/ (logit, hgb, elo, poisson, base_rate)
   ├─ models/b/train_motor_b.py ──► artifacts/EXP08_motor_b_final_20261109/ (pools, stack)
   └─ pipeline/make_ensemble.py ──► pred_ensemble.csv (pesos walk-forward)
                 │
                 ▼
   pipeline/combine_predictions.py ──► artifacts/FINAL/predictions_{all,select,test}.csv
                 │
                 ├─ eval/report.py ──► artifacts/FINAL/eval_test/{metrics.json,metrics.md}
                 └─ pipeline/export_model.py ──► artifacts/model_v1/{model_motor_a.json,features_snapshot.json}
                                                          │ copia byte a byte
                                                          ▼
                                        src/data/prediction/*.json  +  src/domain/prediction/{types,engine}.ts
```

**Tres artefactos gobiernan la producción:** el modelo (`model_motor_a.json`, 12,7 KB), las probabilidades de mercado ya de-vigadas y el contrato de predicción. El feature service (Python) es obligatorio antes de inferir: TypeScript **no** reconstruye features desde un fixture.

---

## 2. Contratos

### 2.1 Predicción (salida del motor)

| Campo | Tipo | Invariante |
|---|---|---|
| `pHome`, `pDraw`, `pAway` | float | ∈ [0,1], suma 1 ± 1e-9 (motor) / ± 1e-6 (mercado) |
| `modelId` | str | `motor_a_logistic_v1` \| `market_devig` \| `base_rates_v1` |
| `modelVersion` | str | `1.0.0` \| `market_devig_v1` |
| `generatedAt` | ISO-8601 | fecha del **artefacto**, no del reloj (determinismo) |
| `dataQualityFlag` | enum | `ok` \| `fallback_motor_a` \| `invalid_features` |

Sin NaN, sin negativos, sin `Infinity`: una violación en el motor es error de programa (`InvalidFeaturesError`), no de datos.

### 2.2 Artefacto de modelo (`model_motor_a.json`)

| Campo | Contenido |
|---|---|
| `type` / `version` / `seed` | `multinomial_logistic` · `1.0.0` · `20261109` |
| `features` | 77 nombres = 54 features + 23 `div_*` |
| `n_features_base` / `div_levels` | 54 · 23 divisiones |
| `imputer.statistics` | mediana por columna (77) |
| `scaler.mean` / `scaler.scale` | estandarización (77); `scale=0 → 1` |
| `coef` / `intercept` / `classes` | 3×77 · 3 · `[H,D,A]` |
| `metadata` | `n_matches=182410`, temporadas 2000/01–2026/27, `train_log_loss=1,012225`, notas |
| `dataset_sha256` | `477eea8d…` (registrado en el artefacto) |

Hashes: modelo `53fbde0f4eb7b47141115d3b7659d3a5229f25169d8a6cc9915522cd17f88ca0`; snapshot `bf1743619877720455b34d61902a30765715a54e0288c0c494beb627447eccc6` (idénticos en `artifacts/model_v1/` y `src/data/prediction/`).

### 2.3 Predicciones (`predictions.csv`)

12 columnas del contrato A08: `match_id`, `div`, `season`, `match_date`, `model_id`, `model_version`, `p_home`, `p_draw`, `p_away`, `fold_id`, `generated_at`, `data_quality_flag`. Una fila por `(match_id, model_id)`; comparaciones sobre la **intersección exacta** de `match_id`.

### 2.4 Dataset

`matches.parquet` 182.414 × 88; `features.parquet` 182.410 × 198; `features_market.parquet` 182.410 × 192. Reglas anti-leakage en [`CONTRACT_DATASET.md`](../../research/prediction-lab/coordination/CONTRACT_DATASET.md): ventana estricta `< match_date`, Elo previo, apertura como información pre-partido, cierre solo *benchmark*.

---

## 3. Motor A (sin cuotas)

### 3.1 Definición

Regresión logística multinomial (L2, `C=1`, `lbfgs`, `max_iter` suficiente) sobre **54 features deportivas** + **23 dummies de división**, con `SimpleImputer(median)` y `StandardScaler` ajustados **solo en train** de cada fold. Ninguna feature usa cuotas, el marcador del partido ni información posterior a `match_date`.

| Bloque de features | n | Ejemplos |
|---|---:|---|
| Elo | 4 | `elo_diff`, `elo_diff_no_hfa`, `elo_prob_home_nodraw`, `elo_diff_x_progress` |
| Forma (r5/r10/ewm5) | 26 | puntos, goles, tiros, SOT, córners y diferenciales |
| Descanso | 6 | `h_days_rest`, `rest_diff`, `congestion_diff` |
| Contexto | 8 | `season_progress`, `round_no`, `div_change`, `season_break` |
| Priors | 10 | `prev_ppg`, `prev_gf_pg`, `prev_ga_pg`, `prev_sot_pg` (S−1 causal) |

La lista es **explícita** (`train_motor_a.py:46-60`) y el entrenador aborta si aparece una columna post-partido/target (`:418`).

### 3.2 Entrenamiento

- Walk-forward expanding: para cada temporada `S`, train = temporadas `< S` **y** `match_date < min(match_date de S)` (`train_motor_a.py:382-384`). El corte por fecha es lo que evita mezclar calendarios europeo y natural.
- `dev ≤ 2022/23`, `val = 2023/24`, `test = 2024/25 + 2025/26`, `live = 2026/27`. **`--no-test` ahora no calcula ni imprime test** (`:478`).
- Semilla `20261109`.
- Sin reentrenamiento post-congelación: el modelo evaluado en test es exactamente el de `artifacts/EXP01_final_20261109/`.

### 3.3 Modelo desplegado y alternativas

| Sistema | Val 2023/24 | Test 2024/25–25/26 | Papel |
|---|---:|---:|---|
| `logit` (desplegado) | 1,01029 | **1,01802** | Motor A en producción (simple, TS) |
| `hgb` | 1,00974 | 1,01860 | Alternativa empatada en val |
| `ensemble` (logit+hgb+poisson, pesos WF) | **1,00821** | **1,01652** | Candidato al siguiente ciclo |
| `elo_ordered` | 1,01666 | — | Respaldo interpretable |
| `poisson_dc` | 1,02621 | — | Solo diversidad/mercados de goles |
| `base_rate` | 1,07365 | 1,07506 | Referencia trivial |

Detalle y comparaciones en [`07_EXPERIMENTOS_RESULTADOS.md`](07_EXPERIMENTOS_RESULTADOS.md) y [`08_COMPARACION_CON_MERCADO.md`](08_COMPARACION_CON_MERCADO.md). **Decisión:** se despliega `logit` porque val está empatada (Δ vs hgb = 0,0006, IC cruza 0) y es el más simple; el ensemble se propone para el siguiente ciclo, no se cambia retroactivamente tras ver test.

---

## 4. Motor B (con cuotas)

### 4.1 Definición

**De-vig *power* sobre cuotas de apertura.** Dado el triplete decimal `(o_H, o_D, o_A)`, se resuelve el exponente `α` tal que `Σ (1/o_k)^α = 1` (Newton-Raphson, tolerancia 1e-13) y se normaliza. Es una transformación **fila a fila**, sin parámetros entre partidos.

| Pieza | Regla |
|---|---|
| Fase | `open` (operable) — el cierre es *benchmark*, no sistema |
| Cadena de fuentes | `ps_power → b365_power → avg_power` (la primera disponible) |
| Cobertura | 79,4 % del universo modelable; **70,0 % en test** (11.295/16.126) |
| Reparto de fuentes | `ps_power` 76.159 · `b365_power` 45.927 · `avg_power` 28 |
| Fallback | sin cuota → Motor A, marcado `fallback_motor_a` |

### 4.2 Lo que Motor B **no** es

- **No** es un clasificador que consume cuotas: el HGB sobre cuotas se sobreajusta (0,98168 en dev vs 0,99035 en val, peor que el de-vig 0,98984).
- **No** es *stacking*: `stack_logit` gana 0,00128 en val frente a apertura, pero la ventaja media por temporada es **+0,00001** (7/21 positiva) y en test la diferencia con el mercado es **+0,0007 [−0,0000, +0,0015], p=0,97** → no significativa. **No se adopta.**
- **No** usa el cierre: el escenario *closing-line* queda declarado como no operable (EXP13).

### 4.3 Fallback

| Situación | `modelId` | Flag |
|---|---|---|
| Mercado válido (3 probs, suma 1 ± 1e-6) | `market_devig` | `ok` |
| Sin mercado | `motor_a_logistic_v1` | `ok` |
| Mercado presente pero inválido | `motor_a_logistic_v1` | `fallback_motor_a` |
| Features irrecuperables | `base_rates_v1` | `invalid_features` |

El prior de último recurso es `GLOBAL_HDA_RATES = {0.44, 0.26, 0.30}` (frecuencia global, **no** calibración por liga): es un *placeholder* seguro, no un pronóstico.

---

## 5. Integración TypeScript

### 5.1 Archivos y API

| Archivo | Líneas | Contenido |
|---|---:|---|
| `src/domain/prediction/types.ts` | 95 | `SnapshotRow`, `ModelArtifact`, `Prediction`, `BaseRates`, errores |
| `src/domain/prediction/engine.ts` | 415 | `assertValidModel`, `predictMotorA`, `predictWithFallback`, `softmax3`, `isValidMarketProbs`, `normalizeBaseRates` |
| `tests/prediction/engine.test.ts` | 403 | 21 tests |
| `src/data/prediction/model_motor_a.json` | 12,7 KB | copia byte a byte del artefacto |
| `src/data/prediction/features_snapshot.json` | 248 KB | 200 partidos con `probs_python` (oráculo de regresión) |

Pipeline de inferencia: `x = [54 features, 23 dummies]` → imputación por mediana → estandarización (`scale=0 → 1`) → 3 logits → softmax estable (resta del máximo) → validación de simplex `1 ± 1e-9`. Función pura: sin I/O, sin reloj, sin mutar entradas; `generatedAt` sale del artefacto.

### 5.2 Paridad y tests

| Métrica | Valor |
|---|---|
| Partidos / comparaciones | 200 / 600 |
| `max abs(Δ)` vs Python | **4,997×10⁻¹³** (`P1:20260919:sp_lisbon:arouca`, H) |
| `mean abs(Δ)` | 2,502×10⁻¹³ |
| `abs(Δ) > 1e-12` | 0 |
| Tolerancia | 1e-9 (≈2.000× el piso de serialización) |
| Tests | **21/21** (`npx vitest run tests/prediction/engine.test.ts`, verificado por A11) |

El residuo es el redondeo a 12 decimales del exportador (`round(float(x), 12)`), no aritmética TS: una recomputación Python independiente da el mismo máximo. `tsc` estricto compila limpio en las rutas A10; el baseline global sigue con **74 errores preexistentes** en `src/` y `tests/`, **0** en A10.

### 5.3 Lo que la capa TS **no** hace

1. **No hay inferencia end-to-end desde un fixture:** recibe 54 features ya calculadas; un partido nuevo exige el feature service Python.
2. **No hace de-vig:** `marketProbs` debe llegar ya limpio (suma ≈ 1); el motor no elige proportional/power/Shin.
3. **No está conectada** a `src/shell/`, a un backend ni a la UI: es una capa de dominio pura.
4. **No estima incertidumbre** ni calibración post-hoc; `train_log_loss = 1,012225` es métrica de entrenamiento, no validez.

**Missingness del snapshot:** 112/200 filas tienen al menos un `null` (máximo 24). El imputer evita el fallo; no recupera información.

---

## 6. Flujo reproducible (resumen)

```bash
cd research/prediction-lab
./.venv/bin/python etl/build_matches.py
./.venv/bin/python features/build_features.py
./.venv/bin/python features/build_market_features.py
./.venv/bin/python models/a/train_motor_a.py --tag EXP01_final --no-test
./.venv/bin/python pipeline/make_ensemble.py --artifact artifacts/EXP01_final_20261109 \
    --members logit,hgb,poisson_dc --out ensemble
./.venv/bin/python models/b/train_motor_b.py --motor-a artifacts/EXP01_final_20261109 \
    --base ensemble --phase open --tag EXP08_motor_b_final
./.venv/bin/python pipeline/combine_predictions.py \
    --artifacts artifacts/EXP01_final_20261109,artifacts/EXP08_motor_b_final_20261109 \
    --out artifacts/FINAL/predictions_test.csv
./.venv/bin/python pipeline/export_model.py --out artifacts/model_v1
```

Comandos completos, hashes y verificación del leakage en [`12_REPRODUCIBILIDAD.md`](12_REPRODUCIBILIDAD.md).

---

## 7. Límites de la arquitectura

1. **Dos lenguajes, un solo feature service.** El pipeline Python es la única fuente de verdad; TS solo aplica transformaciones lineales. Cualquier cambio de definición exige regenerar artefacto y snapshot y repetir A10.
2. **Un modelo, no un sistema.** No hay calibración post-hoc, intervalos ni modelado por competición; el `logit` es deliberadamente simple.
3. **Motor B es un precio, no un pronóstico.** Su valor es la calibración del mercado (ECE 0,0055) y el *benchmark*; no genera *edge*.
4. **Sin UI ni API.** La integración termina en el dominio; falta el adaptador `match_id → SnapshotRow` y un endpoint.
5. **Deuda heredada:** 74 errores de `tsc` y la UI legacy rota siguen fuera del alcance de este ciclo.
