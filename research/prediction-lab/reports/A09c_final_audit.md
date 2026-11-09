# A09c — Verificación final del cierre (auditoría acotada)

**Estado:** **verificación del orquestador**, no una auditoría independiente. La tercera auditoría
encargada a un subagente (A09c/A09d) no llegó a entregar: el primer intento se interrumpió tras 90
minutos sin informe y el segundo no produjo salida. Este documento recoge las cinco comprobaciones
que el orquestador ejecutó sobre el estado final, con evidencia reproducible. **No sustituye a una
auditoría independiente** y así debe citarse.

**Fecha:** 2026-11-09 · **Commit auditado:** `2895324` · **Ámbito:** cierre de test, artefactos y
documentación.

---

## 1. Comprobaciones ejecutadas

| # | Comprobación | Resultado | Evidencia |
|---|---|---|---|
| 1 | Recalcular log-loss test de `logit`, `ensemble`, `market_close_best_power`, `stack_logit` desde `FINAL/predictions_test.csv` y comparar con `FINAL/eval_test/metrics.json` | **Δ = 0,00e+00 en los 4** (1.018019 / 1.016524 / 0.997703 / 1.005274) | `eval.metrics.multiclass_log_loss` sobre `predictions_test.csv` + `matches.parquet` |
| 2 | Orden temporal freeze → test | **Correcto:** `FREEZE.md` nace a las **03:35:07**; `eval_test/metrics.json` a las **03:36:17** | `stat -f %SB` (birth time) |
| 3 | Seis cifras de `docs/predicciones/` | **6/6 correctas** (ver §2) | comandos de §2 |
| 4 | Integridad de `predictions_test.csv` | 108.051 filas; **0 duplicados** `(match_id, model_id)`; **0** filas sin `y`; `max |Σp−1| = 5,55e-16`; probabilidad mínima 0,00914 (sin ceros) | pandas sobre el CSV |
| 5 | Suite TS de integración | **21/21 OK**; paridad **max|Δ| = 4,997e-13** en 600 comparaciones | `npx vitest run tests/prediction/engine.test.ts` |

## 2. Las seis cifras verificadas

| Afirmación documental | Valor comprobado | Fuente |
|---|---|---|
| `matches.parquet` = 182.414 × 88 | 182.414 × 88 | `pd.read_parquet(...).shape` |
| `features.parquet` = 182.410 × 198 | 182.410 × 198 | idem |
| `features_market` = 182.410 × 192 | 182.410 × 192 | idem |
| `logit` test log-loss = 1,01802 | 1,018019 | recálculo |
| `logit` vs mercado cierre = +0,0203 | 1,018019 − 0,997703 = **0,020316** | recálculo |
| paridad TS = 4,997e-13 | 4,997×10⁻¹³ | test |
| `eval/` 83/83 | **83/83 OK** | `unittest discover` |

## 3. Discrepancias y riesgos residuales

1. **Exposición a test durante el desarrollo.** Cuatro `metrics.json` intermedios (incluido
   `EXP01_final`) contenían la partición `test` antes del cierre, y el orquestador inspeccionó uno
   de ellos. La selección se hizo con `val` y la tabla final se generó después de `FREEZE.md`
   (verificado por birth time del archivo, no por el texto). Aun así, **el cierre no es un
   pre-registro perfecto**; se documenta en `14_AUDITORIA_ADVERSARIAL.md` y `FREEZE.md`.
2. **Sin tercera auditoría independiente.** Este documento es una verificación del propio
   orquestador; el valor de independencia de A09/A09b no se replica aquí.
3. **Motor B no significativo.** `stack_logit` vs mercado apertura en test: +0,0007
   [−0,0000; +0,0015], p=0,97; la mejora de val no es robusta por temporada (media +0,00001).
4. **Riesgos ya abiertos:** priors S−1 exactos al 88,5 %, licencia de football-data sin resolver,
   sin CLV real todavía (A13 deja la infraestructura), 74 errores `tsc` legacy, `fallback_motor_a`
   no persistido por partido.

## 4. Veredicto

**Defendible como foto final del ciclo 1**, con dos condiciones explícitas:
1. Presentar el resultado como **"medido una vez, con selección previa en val y exposición parcial
   durante el desarrollo"**, no como pre-registro perfecto.
2. No reutilizar `test` para ninguna decisión futura; la promoción del ensemble va por la muestra
   prospectiva de `PREREGISTRATION_CYCLE2.md`.

**Correcciones recomendadas antes de publicar:** (a) citar siempre el orden `FREEZE` (03:35:07) →
`test` (03:36:17) con evidencia de *birth time*, y (b) dejar claro en cualquier resumen que Motor B
no supera al mercado y que la comparación de test tuvo exposición previa.

## 5. Reproducibilidad

```bash
cd research/prediction-lab
./.venv/bin/python - <<'PY'
# recálculo de log-loss y comprobación de integridad (ver §1)
PY
stat -f "%SB %Sm" -t "%Y-%m-%dT%H:%M:%S" artifacts/FREEZE.md artifacts/FINAL/eval_test/metrics.json
./.venv/bin/python -m unittest discover -s eval/tests -p "test_*.py"
cd .. && npx vitest run tests/prediction/engine.test.ts
```
