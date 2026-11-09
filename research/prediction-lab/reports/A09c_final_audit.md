# A09c — Auditoría final acotada del cierre

**Auditor:** independiente (no participó en la implementación) · **Fecha:** 2026-11-09
**Entorno:** `/Users/jairbonilla/PitchLab-Prediction-Lab`, trabajo desde `research/prediction-lab/`, intérprete `./.venv/bin/python` (3.9.6)
**Alcance:** exactamente las cinco comprobaciones encargadas. No se revisó código de producción ni se reejecutó el pipeline; toda afirmación no medida se marca como **NO VERIFICADO**.

> **Nota:** este fichero reemplaza la versión provisional del orquestador (mtime 04:13), que se declaraba «no independiente». Su hallazgo —`FREEZE.md` fue *creado* antes de la evaluación— se verificó aquí con `stat -f %SB` (§3). El resto del análisis es nuevo.

---

## 1. Tabla de comprobaciones

| # | Comprobación | Resultado | Evidencia (comando) |
|---|---|---|---|
| 1 | Recalcular log-loss test de `logit`, `ensemble`, `market_close_best_power`, `stack_logit` | ✅ **PASA** — diferencia 0,000e+00 en los cuatro | `multiclass_log_loss` de `eval/metrics.py` sobre `predictions_test.csv` ⋈ `matches.parquet` |
| 2 | ¿La congelación precede a la evaluación? | ✅ **PASA por creación** (03:35:07 < 03:36:17); ⚠️ el fichero fue **modificado** a las 03:48:21 para añadir la adenda post-test | `stat -f "%SB %Sm"` |
| 3 | Verificar 6 cifras de `docs/predicciones/` | ✅ **6/6 correctas** | artefactos + `unittest` + `vitest` (§4) |
| 4 | Integridad de `artifacts/FINAL/predictions_test.csv` | ✅ **PASA** — 0 duplicados, simplex 5,55e-16 | pandas sobre el CSV |
| 5 | `npx vitest run tests/prediction/engine.test.ts` | ✅ **PASA** — 21/21, 613 ms | salida de vitest |

**checks_run = 5 · checks_failed = 0** (una discrepancia documental, D1, que no invalida ninguna comprobación sustantiva).

---

## 2. C1 — Recalculo del log-loss (independiente)

Se unió `predictions_test.csv` (108.051 filas) con `matches.parquet` (182.414 filas, `match_id` único, 0 duplicados) por `match_id`; `result` H/D/A → 0/1/2; 0 filas huérfanas y 0 `result` nulos tras el join. Se aplicó `eval.metrics.multiclass_log_loss` (ln natural, recorte 1e-15, sin renormalizar después del recorte) y se comparó con `models.<id>.by_partition.test.log_loss` de `artifacts/FINAL/eval_test/metrics.json`.

| Modelo | n | Recalculado | `metrics.json` | Diferencia |
|---|---:|---:|---:|---:|
| `logit` | 16.126 | 1,0180186624866017 | 1,0180186624866017 | **0,000e+00** |
| `ensemble` | 16.126 | 1,0165241827106917 | 1,0165241827106917 | **0,000e+00** |
| `market_close_best_power` | 16.126 | 0,9977026672199736 | 0,9977026672199736 | **0,000e+00** |
| `stack_logit` | 16.126 | 1,0052740108488813 | 1,0052740108488813 | **0,000e+00** |

Coincidencia bit a bit (no solo dentro de tolerancia): los cuatro valores son idénticos al último dígito IEEE-754. El `n` declarado coincide con el recuento real por modelo. **Resultado: reproducible.**

## 3. C2 — Orden temporal de la congelación

```
stat -f "%SB  %Sm  %N" -t "%Y-%m-%dT%H:%M:%S" artifacts/FREEZE.md artifacts/FINAL/eval_test/metrics.json artifacts/FINAL/predictions_test.csv
birth=2026-11-09T03:35:07  mtime=2026-11-09T03:48:21  artifacts/FREEZE.md
birth=2026-11-09T03:36:17  mtime=2026-11-09T03:36:17  artifacts/FINAL/eval_test/metrics.json
birth=2026-11-09T03:35:41  mtime=2026-11-09T03:35:42  artifacts/FINAL/predictions_test.csv
```

`metrics.json` declara `generated_at = 2026-11-09T09:36:16+00:00` (= 03:36:16 local, coherente con su mtime). Las predicciones se generaron a las 09:35:15Z (= 03:35:15 local, coherente). Lectura correcta, que exige separar creación de modificación:

- **Por creación, la congelación SÍ precede a la evaluación:** `FREEZE.md` nace a las 03:35:07, 70 segundos antes de que exista `metrics.json` (03:36:17). El comando que pedía el encargo (`%Sm`, mtime) daría «no», pero el mtime está contaminado por la adenda.
- **Por última modificación, el fichero es posterior:** 03:48:21, doce minutos después de la evaluación. La causa es explícita: el documento contiene una **adenda POST-TEST declarada** con la tabla de resultados de test.
- **Inconsistencia menor (D1):** la adenda se fecha a las **03:52**, cuatro minutos *después* del mtime del propio fichero (03:48:21). Un fichero no puede contener texto escrito a las 03:52 si su última modificación es 03:48; la marca «03:52» es inexacta (o el reloj/una copia alteraron el mtime).
- `git log`: el commit `ac27697` (03:59:03) introduce **a la vez** `FREEZE.md` y `metrics.json`; el historial no permite separar cronológicamente ambos artefactos.

**Resultado: PASA con matiz.** La pre-registración existió antes de evaluar (evidencia de creación), pero el artefacto almacenado ya no es puro: incorpora resultados de test. La adenda **reconoce explícitamente** que metrics intermedios (p. ej. `EXP01_final`) contenían la columna `test` antes del documento y que la selección se hizo con `val`. Eso convierte el defecto en un problema de trazabilidad declarado, no en un fraude silencioso, pero impide certificar «congelar → evaluar una vez» con evidencia inmutable.

## 4. C3 — Seis cifras de `docs/predicciones/`

| # | Cifra | Fuente | Verificación | Veredicto |
|---|---|---|---|---|
| 1 | **182.414 partidos** | `00_INDICE.md`, `04_ARQUITECTURA_MOTORES.md` | `matches.parquet` → `(182414, 88)`; 182.410 con `result` | ✅ **ACIERTO** |
| 2 | **182.410 × 198 features** | `00_INDICE.md`, `04_…`, `12_REPRODUCIBILIDAD.md` | `features.parquet` → `(182410, 198)` | ✅ **ACIERTO** |
| 3 | **1,01802 logit test** | `00_INDICE.md`, `07_…`, `08_…` | recalculado 1,0180186625; `metrics.json` idéntico | ✅ **ACIERTO** (redondeo correcto) |
| 4 | **+0,0203 logit vs mercado** | `08_COMPARACION_CON_MERCADO.md`, `07_…` | `comparisons[logit vs market_close_best_power]`: Δ = 0,0203159953; IC95 [0,0175403, 0,0231323]; p = 9,999e-05 | ✅ **ACIERTO** |
| 5 | **4,997e-13 paridad TS** | `04_…`, `11_…` | `npx vitest run tests/prediction/engine.test.ts` imprime `max|Δ|=4.997e-13` en 600 comparaciones, 0 > 1e-12 | ✅ **ACIERTO** |
| 6 | **83/83 eval** | `00_INDICE.md`, `06_METODOLOGIA_BACKTESTING.md` | `./.venv/bin/python -m unittest discover -s eval/tests -t eval/tests` → `Ran 83 tests … OK` (2,328 s) | ✅ **ACIERTO** |

La tabla de la adenda de `FREEZE.md` (7 modelos) coincide dígito a dígito con `metrics.json`, incluido `market_open_best_power` (n = 11.295); `features_market.parquet` da `(182410, 192)`, coherente. No hay cifras infladas ni redondeos interesados.

## 5. C4 — Integridad de `predictions_test.csv`

| Comprobación | Resultado |
|---|---|
| Filas | 108.051 |
| Duplicados `(match_id, model_id)` | **0** |
| `max |Σ(p_home+p_draw+p_away) − 1|` | **5,551e-16** (p99 = 3,33e-16; 0 filas > 1e-6) |
| Probabilidades fuera de [0,1] / NaN | 0 / 0 (mín. 0,00914; máx. 0,96669) |
| Partidos por modelo | 16.126 en `base_rate`, `hgb`, `logit`, `ensemble`, `stack_logit`, `market_close_best_power`; **11.295** en `market_open_best_power` |
| `data_quality_flag` | 108.051 filas `ok` |
| sha256 | `6950b97f4ffb0806…`, coincide con el prefijo registrado en `eval_test/metrics.md` |

El déficit de `market_open_best_power` (11.295 = 70,0 %) es esperado por cobertura de cuotas de apertura y está declarado en la tabla de test; no es un fallo de integridad. **Resultado: PASS.**

## 6. C5 — Vitest

```
npx vitest run tests/prediction/engine.test.ts
✓ tests/prediction/engine.test.ts (21 tests) 66ms
Test Files  1 passed (1) · Tests  21 passed (21) · Duration 613ms
```

Incluye la paridad numérica (200 partidos / 600 comparaciones, `max|Δ| = 4,997e-13`) y la imputación por mediana en 112/200 filas con nulos. **Resultado: PASS.**

---

## 7. Discrepancias

1. **D1 (media) — Hora de la adenda incoherente.** `FREEZE.md` declara la adenda a las 03:52 pero su mtime es 03:48:21; además el fichero se modificó 12 min después de `metrics.json`. La pre-registración es defendible por *birth time*, pero el documento almacenado ya contiene test.
2. **D2 (baja) — `metrics.json` es solo test.** Sus `warnings` listan los 7 modelos «sin predicciones en `['dev','val','live']`». La «foto final» no es autocontenida: las cifras de `val` que justifican la selección viven en otros artefactos y no se verificaron aquí.
3. **D3 (informativa) — Exposición previa a test declarada.** La adenda admite que metrics intermedios incluían `test` antes de la congelación. No se auditó su alcance real.

## 8. Veredicto

**Defendible como foto final de resultados; defendible con reservas como pre-registro.**

Lo que sostiene el cierre es sólido: los cuatro log-loss se reproducen **exactamente** desde los artefactos crudos, el CSV está limpio (0 duplicados, simplex a 5,5e-16, hash consistente), las seis cifras de la documentación son correctas y las dos suites (83 unitarios + 21 vitest) pasan. La conclusión sustantiva —el mercado gana por 0,0188–0,0203 y el Motor A no tiene *edge*— está medida, no narrada, y el documento reconoce la exposición previa a test.

Lo que no queda demostrado con evidencia inmutable es la **secuencia metodológica**: el fichero que dice «congelado antes de evaluar» fue modificado después de evaluar para incorporar resultados de test, y la hora declarada de esa adenda (03:52) es imposible frente a su mtime (03:48). Un revisor externo puede aceptar la creación temprana (03:35:07), pero no certificar el contenido original.

**Dos correcciones:**

1. **Pre-registro inmutable y adenda separada:** commit de `FREEZE.md` *sin* adenda **antes** de lanzar `eval.report`, con `sha256` de `predictions_test.csv` y `matches.parquet` y hora del sistema; la adenda post-test, en un fichero aparte con su propio mtime. Así la cronología se prueba con git, no con una firma de texto.
2. **Hacer autocontenida la foto final:** o se añaden `dev`/`val`/`live` a `metrics.json`, o se declara explícitamente «test-only» y se enlaza el artefacto que contiene las métricas de `val` usadas en la selección; hoy los `warnings` dejan 7 modelos sin cobertura fuera de test.

## 9. NO VERIFICADO

- Que la selección de modelos se hiciera **solo** con `val`: no se reejecutó el pipeline ni se auditaron los `metrics.json` intermedios (`EXP01_final`, etc.). Solo se leyó la declaración.
- Las cifras de **val** de `FREEZE.md` (§1–2): no existe partición `val` en `metrics.json` y no se recalcularon.
- El alcance real de la **exposición previa a test** que la adenda reconoce.
- Integridad de `predictions_all.csv` / `predictions_select.csv` y de `monitoring_live.*` (fuera del alcance acotado).
- La paridad TS más allá del snapshot de 200 partidos que ejecuta el test.
