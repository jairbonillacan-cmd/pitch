# A10 — Integración TypeScript del Motor A y paridad numérica con Python

**Worktree:** `/Users/jairbonilla/PitchLab-Prediction-Lab` · **Rama:** `prediction-lab` · **Commit:** `8424876`
**Fecha:** 2026-11-09 (America/Mexico_City) · **Agente:** INTEGRATION ENGINEER
**Alcance escrito:** `src/domain/prediction/**`, `src/data/prediction/**`, `tests/prediction/**`, `reports/A10_integration.md`, `coordination/status/A10.json`. No se modificó ningún motor legacy, `src/shell/`, `tests/domain/`, `src/data/index.ts` ni el laboratorio Python.
**Etiquetas:** **OBSERVADO** = salida de comando o línea de archivo; **INFERIDO** = consecuencia lógica explicitada.

---

## 0. Veredicto

**OBSERVADO — el port TS reproduce el oráculo hasta el límite de serialización.** Las 200 predicciones de Python coinciden con **|Δ| máximo = 4,997×10⁻¹³** y media **2,502×10⁻¹³** en 600 comparaciones (200 partidos × 3 clases); ninguna supera 10⁻¹². La tolerancia de 10⁻⁹ se cumple con margen ~2.000×. El residuo no es del motor: `export_model.py` serializa `probs_python` con `round(float(x), 12)`, cuyo error máximo por componente es 5×10⁻¹³. Una reimplementación independiente en Python sobre el mismo artefacto da el mismo máximo (4,997114×10⁻¹³), lo que confirma que el residuo es redondeo de serialización, no aritmética TS.

La suite A10 pasa **21/21 tests** y los archivos A10 compilan limpios con `tsc` estricto. El repositorio sigue con **74 errores de `tsc` preexistentes** en `src/` y `tests/`; **ninguno** está en las rutas A10.

---

## 1. Contrato de inferencia

### 1.1 Entradas

| Elemento | Tipo | Invariante |
|---|---|---|
| `SnapshotRow.features` | `readonly (number \| null)[54]` | orden de `model.features[0..53]`; `null` = missing |
| `SnapshotRow.div_onehot` | `readonly number[23]` | orden de `model.div_levels`; suma 1 |
| `ModelArtifact.features` | `readonly string[77]` | `features[54..76] === "div_" + div_levels[i]` |
| `ModelArtifact.coef` | `readonly number[3][77]` | 3 clases H/D/A × 77 columnas |
| `ModelArtifact.intercept` | `readonly number[3]` | 3 valores |
| `imputer.statistics`, `scaler.mean/scale` | `readonly number[77]` | mediana y estandarización por columna |

El snapshot es un mapa `match_id → fila` con `n = 200` y `generated_at = 2026-11-09T09:01:26+00:00`. **112 de 200 filas tienen al menos un `null`** (máximo 24). El test exige que la predicción con `null` sea idéntica a la de una fila donde el `null` se sustituye explícitamente por `imputer.statistics[i]`.

### 1.2 Pipeline

`predictMotorA(row, model)`:

1. **Vector:** `x = [...row.features, ...row.div_onehot]` (54 + 23).
2. **Imputación:** `null`/`NaN` → `imputer.statistics[i]`; si la estadística no es finita → `InvalidFeaturesError`. `Infinity` no se imputa: es corrupción.
3. **Estandarización:** `z[i] = (x[i] - mean[i]) / (scale[i] === 0 ? 1 : scale[i])`.
4. **Logits:** `logits[k] = Σ coef[k][i]·z[i] + intercept[k]`.
5. **Softmax estable:** resta del máximo, exponencial y normalización. Se valida suma 1 ± 1e-9 y cada `p ∈ [0,1]`; un fallo aquí es error de programa, no de datos.
6. **Salida:** `modelId = "motor_a_logistic_v1"`, `modelVersion = model.version`, `generatedAt = model.created_at`, `dataQualityFlag = "ok"`.

**Pureza (OBSERVADO).** Sin I/O, sin reloj, sin mutar entradas, sin dependencias. `generatedAt` sale del artefacto, no de `Date.now()`: dos llamadas devuelven objetos idénticos. El test serializa fila y modelo antes/después y comprueba que no cambian. `assertValidModel` valida dimensiones, finitud y longitudes en cada llamada pública (O(77)).

### 1.3 Fallback

`predictWithFallback(row, model, marketProbs?, baseRates?)`:

| Situación | `modelId` | Flag | Probabilidades |
|---|---|---|---|
| Mercado válido (3, finitos, `[0,1]`, suma 1 ± 1e-6) | `market_devig` | `ok` | mercado normalizado |
| Sin mercado (`undefined`/`null`) | `motor_a_logistic_v1` | `ok` | Motor A |
| Mercado presente pero inválido | `motor_a_logistic_v1` | `fallback_motor_a` | Motor A |
| Features irrecuperables | `base_rates_v1` | `invalid_features` | prior H/D/A normalizado |

El prior por defecto es `GLOBAL_HDA_RATES = {0.44, 0.26, 0.30}` y se puede inyectar como cuarto argumento; un prior inválido vuelve al global. Un mercado válido gana aunque las features estén corruptas porque no las consume. `predictMotorA` sí lanza `InvalidFeaturesError`; `predictWithFallback` nunca propaga errores de datos.

---

## 2. Por qué las features se precalculan en Python

**Decisión (INFERIDO).** TS no reconstruye las 54 features desde fixtures: el pipeline Python (`features/build_features.py`, `models/a/train_motor_a.py`) es la única fuente de verdad de Elo, priors causales, ventanas rolling y dummies. Duplicar esa lógica en TS crearía dos implementaciones que divergen en el primer cambio de definición (ventanas, medianas de `NaN`, alineación de fechas) y la paridad dejaría de ser verificable.

El artefacto exporta todo lo necesario para inferir sin sklearn: orden de columnas, medianas, media/escala, coeficientes, interceptos y niveles. TS solo aplica esas transformaciones. Ventajas: motor puro de ~12 KB de datos, apto para backend/edge; snapshot de 200 partidos como oráculo de regresión; contrato congelado por versión y `dataset_sha256`. Coste: **no hay inferencia end-to-end desde un fixture crudo**; el backend debe llamar antes al feature service. Si cambia el pipeline, se regeneran artefacto y snapshot y se repite A10.

---

## 3. Paridad medida

**Método (OBSERVADO).** `tests/prediction/engine.test.ts` carga las copias byte a byte de `model_motor_a.json` (SHA-256 `53fbde0f…f88ca0`) y `features_snapshot.json` (SHA-256 `bf174361…eccc6`), recorre los 200 `match_id` y compara componente a componente contra `probs_python`.

| Métrica | Valor |
|---|---|
| Partidos / comparaciones | 200 / 600 |
| `max \|Δ\|` | **4,997×10⁻¹³** (`P1:20260919:sp_lisbon:arouca`, H) |
| `mean \|Δ\|` | 2,502×10⁻¹³ |
| `\|Δ\| > 10⁻¹²` | 0 |
| Tolerancia | 10⁻⁹ |
| Recomputación Python independiente | `max = 4,997114×10⁻¹³` |

**Tolerancia.** El oráculo está redondeado a 12 decimales; el techo por componente es 5×10⁻¹³ y el máximo observado está exactamente ahí. Por eso 10⁻⁹ no oculta un error: es ~2.000× el piso de serialización. No se encontró discrepancia de orden, escala ni softmax; el one-hot de las 200 filas coincide con `div_levels` y `model.features[54..76]` con `"div_" + nivel`.

**Otras verificaciones (21/21):** simplex y rango `[0,1]` en los 200; determinismo y no mutación; `softmax3([1000,1001,1002])` finito y ordenado; `scale=0` se trata como 1; 112/200 filas con nulls igualan la imputación explícita; `null` no se trata como 0; `NaN` se imputa si la mediana es finita; `null` sin mediana → `invalid_features`; fallback válido/ inválido/ausente; features corruptas; prior inyectado; artefacto con 77 columnas (54 + 23), 3 clases y 3 interceptos.

**Salida real** de `npx vitest run tests/prediction/engine.test.ts`:

```text
[A10] paridad Motor A: 200 partidos / 600 comparaciones; max|Δ|=4.997e-13 (P1:20260919:sp_lisbon:arouca H); mean|Δ|=2.502e-13; >1e-12=0
[A10] nulls: 112/200 filas con al menos un null; todas igualan la imputación explícita por mediana

 ✓ tests/prediction/engine.test.ts (21 tests) 330ms
 Test Files  1 passed (1)
      Tests  21 passed (21)
```

`tsc` solo A10 → exit 0. `npx tsc --noEmit` global → 74 errores preexistentes, 0 en rutas A10.

---

## 4. Limitaciones

1. **No es inferencia end-to-end desde fixtures.** El contrato empieza en 54 features ya calculadas; un partido nuevo exige el feature service. TS no lee resultados, cuotas ni lesiones.
2. **Motor B requiere cuotas y no hace de-vig.** `market_devig` acepta probabilidades ya limpias (suma ≈ 1). Con cuotas 1X2 crudas, el backend debe aplicar antes proportional/power/Shin; el motor no elige ni valida el método.
3. **El prior de `invalid_features` es grueso.** 0,44/0,26/0,30 es una frecuencia global, no calibración por liga/temporada. Es un placeholder seguro, no un pronóstico; debe instrumentarse.
4. **Modelo logístico, sin incertidumbre.** No hay intervalos, calibración post-hoc ni validación OOS en TS. `train_log_loss = 1,012225` (182.410 partidos, 2000/01–2026/27) es métrica de entrenamiento, no validez predictiva. A09 ya advirtió paridad ≠ validación.
5. **`generatedAt` es la fecha del artefacto**, elegida por determinismo. Para auditar la petición, el backend debe añadir `requestedAt`.
6. **Missingness alto:** 112/200 filas con algún null (56%). El imputer evita el fallo pero no recupera información ni propaga incertidumbre.
7. **Tamaño:** el snapshot (248 KB) es solo para tests y no debe enviarse al cliente; el modelo (12,7 KB) sí es apto para bundle/edge. No hay caché ni batch en esta capa.
8. **`market_devig` no es el Motor B completo de A07:** es un adaptador de contrato, no un estimador desde cuotas.

---

## 5. Integración en backend

**INFERIDO.** La capa `src/domain/prediction` es pura y no conoce HTTP, BD ni feature store. El adaptador debería:

1. Cargar el artefacto una vez al arrancar, ejecutar `assertValidModel` y mantenerlo inmutable.
2. Resolver `match_id` → `SnapshotRow` vía feature service, respetando el orden de las 54 features y construyendo el one-hot desde `div_levels`.
3. Pasar `marketProbs` ya de-vigadas si existen; si no, llamar sin tercer argumento (Motor A, `ok`).
4. Persistir la `Prediction` con `modelId`, `modelVersion`, `generatedAt` y `dataQualityFlag`, más `match_id`, versión del feature set y `dataset_sha256`.
5. Instrumentar `% invalid_features`, `% fallback_motor_a`, distribución de `pDraw` y drift; una subida de `invalid_features` indica fallo del feature service, no del modelo.
6. Exponer `POST /v1/predictions` con `{ match_id }` → `{ pHome, pDraw, pAway, modelId, modelVersion, generatedAt, dataQualityFlag }`, añadiendo `requestedAt` y `featureSetVersion` en el sobre si se audita.
7. En CI, regenerar artefacto/snapshot solo con Python y ejecutar A10; un cambio de versión o `dataset_sha256` exige paridad 10⁻⁹ y revisión de calibración. El snapshot no se despliega; el modelo sí puede ir embebido.

Los JSON viven aislados en `src/data/prediction/`; el dominio solo importa tipos.

---

## 6. Verificación reproducible

```bash
shasum -a 256 research/prediction-lab/artifacts/model_v1/*.json src/data/prediction/*.json
npx vitest run tests/prediction/engine.test.ts
npx tsc --noEmit --strict --noUncheckedIndexedAccess --noImplicitOverride \
  --resolveJsonModule --moduleResolution bundler --module ESNext --target ES2022 \
  --skipLibCheck --lib ES2022,DOM,DOM.Iterable \
  src/domain/prediction/types.ts src/domain/prediction/engine.ts tests/prediction/engine.test.ts
npx tsc --noEmit   # baseline: 74 errores preexistentes, 0 en rutas A10
```

**Archivos:** `src/domain/prediction/types.ts`, `src/domain/prediction/engine.ts`, `tests/prediction/engine.test.ts`, `src/data/prediction/model_motor_a.json`, `src/data/prediction/features_snapshot.json`, `reports/A10_integration.md`, `coordination/status/A10.json`.
