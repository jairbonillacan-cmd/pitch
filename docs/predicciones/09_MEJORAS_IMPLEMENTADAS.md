# 09 — Mejoras implementadas (aceptadas y rechazadas)

**Documento:** registro de cambios del ciclo, con la evidencia **antes/después** y la decisión.
**Fecha:** 2026-11-09 · **Autor:** SUBAGENTE 11 — DOCUMENTATION & REPRODUCIBILITY · **Commit:** `a680a4f`.
**Fuentes:** [`A05`](../../research/prediction-lab/reports/A05_features.md) · [`A06`](../../research/prediction-lab/reports/A06_motor_a_experiments.md) · [`A07`](../../research/prediction-lab/reports/A07_market_intelligence.md) · [`A08`](../../research/prediction-lab/reports/A08_backtesting_framework.md) · [`A09b`](../../research/prediction-lab/reports/A09_adversarial_lab.md) · [`A10`](../../research/prediction-lab/reports/A10_integration.md) · [`FREEZE.md`](../../research/prediction-lab/artifacts/FREEZE.md).

> **Criterio de aceptación.** Un cambio entra si (a) mejora una regla propia (log-loss/Brier/RPS) con IC95 % que excluye 0 **y** p < 0,05, o (b) corrige un defecto de integridad/leakage verificable, o (c) es una condición necesaria de reproducibilidad. Lo que solo mejora *accuracy* o un subconjunto elegido después **no entra**.

---

## 1. Aceptadas (con evidencia)

| # | Cambio | Antes | Después | Evidencia | Artefacto |
|---|---|---|---|---|---|
| M1 | **Dataset v1.1**: recuperar G1 (cabeceras `HT`/`AT`) y unificar alias | 181.272 filas; G1 empezaba en 2005/06 | **182.414** filas (+1.142); 23 divisiones | `matches.parquet`; `validation_report.json` 73 checks, **0 críticos** | `data/processed/` |
| M2 | **Priors causales S−1** (join corregido) | 100 % de 166.615 filas con prior de **S+1** | 99,63 % S−1 (verificado por A11); 100 % del cuádruple `(n,ppg,gf_pg,ga_pg)` con la temporada anterior observada (A09b) | `build_features.py:163-186`; test de viaje en el tiempo **0/198** | `features.parquet` |
| M3 | **Corte por fecha en walk-forward** | 34.261 filas de train posteriores al 1.er partido del fold; 782/8.110 (9,6 %) de test 2024 y 870/8.016 (10,9 %) de 2025 contaminadas | 0 filas futuras; ΔLL medido **+9,4×10⁻⁵** (pequeño pero estructural) | `train_motor_a.py:382-384`; `run_walk_forward` | `EXP01_final` |
| M4 | **Test realmente bloqueado** | `--no-test` solo afectaba a la impresión; 4 `metrics.json` y `predictions.csv` contenían test | `--no-test` restringe particiones a dev/val (`:478`); test se ejecuta **una vez** sobre candidatos congelados | `FREEZE.md` 03:35 (creado antes del test); `FINAL/` 03:35-03:36 | `FINAL/eval_test/` |
| M5 | **Poisson corregido** | NaN en 7 celdas división-temporada sin historia (19.624/153.802 filas en v1.0); índice de defensa del local con máscara del visitante | fallback a climatología de liga; `known_h` en ambas ramas (`:244-249`); filtro `isfinite` (`:396`) | `EXP03_poisson_final` sin NaN | `pred_poisson_dc.csv` |
| M6 | **Ensemble walk-forward** | pesos 0,2 inválidos (NaN de Poisson → punto inicial) | `make_ensemble.py`: pesos por temporada con `years < S`, suavizado 50/50; miembros logit/hgb/poisson | val **1,00821**; test **1,01652** (−0,00153 vs logit, p=0,001) | `EXP01_final/ensemble_weights.json` |
| M7 | **Lista blanca de features con guarda** | `select_dtypes` habría metido 21 columnas post-partido y 5 de target | `FEATURES` explícita + aborto si aparece una prohibida | `train_motor_a.py:418` | `train_motor_a.py` |
| M8 | **Integración TypeScript** | no existía capa de inferencia | dominio puro + JSON; paridad **4,997×10⁻¹³**; **21/21** tests | `reports/A10_integration.md`; reejecutado por A11 | `src/domain/prediction/`, `src/data/prediction/` |
| M9 | **Informe final reproducible** | informes previos con B=200/1.000 permutaciones y sin hashes | `metrics.json` con hashes, config B=2000/10.000, semilla 20261109, commit | `FINAL/eval_test/metrics.md` §1 y §9 | `FINAL/` |
| M10 | **Selección de candidatos** | decisión implícita en el informe | `select_candidates.py` + `combine_predictions.py` + `FREEZE.md` pre-registrado | `candidate_selection.json` | `artifacts/` |

### 1.1 Cuánto valía cada corrección

| Corrección | Efecto medido | Lectura |
|---|---:|---|
| Priors S+1 → S−1 | hgb val **1,00730 → 1,00974** (+0,00244) | ~0,0024 del rendimiento aparente era fuga de futuro |
| Calibración tras el fix | hgb + Dirichlet **−0,00112 → +0,00007** | toda la “mejora” de calibración venía del leakage |
| Draw blend tras el fix | **−0,00135 → −0,00004** (IC cruza 0) | el blend dejó de aportar |
| Corte por fecha | ΔLL **+9,4×10⁻⁵** | pequeño, pero elimina una fuga estructural |
| Ensemble walk-forward | val 1,00821 vs hgb 1,00974 | la única mejora de modelado que sobrevive |

**Conclusión:** la mayor ganancia del ciclo no vino de un modelo nuevo sino de **quitar información del futuro**. Cualquier comparación con las cifras de v1.0 está viciada y se retira en [`07_EXPERIMENTOS_RESULTADOS.md`](07_EXPERIMENTOS_RESULTADOS.md) §3.

---

## 2. Rechazadas (con el porqué)

| # | Cambio propuesto | Evidencia en contra | Decisión |
|---|---|---|---|
| R1 | **Stacking/clasificador de Motor B** | val −0,00128 [−0,00170, −0,00080], pero por temporada **+0,00001** (7/21); test **+0,0007 [−0,0000, +0,0015], p=0,97** | No se adopta; Motor B = de-vig *power* |
| R2 | **Capa de calibración** (temperature/vector/isotonic/Dirichlet) | hgb empeora con todos (Δ ≥ 0); logit −0,00061 con IC que cruza 0; solo mejora ECE | No se adopta por defecto |
| R3 | **Blend/umbral de empate** | blend −0,00004 [−0,00056, +0,00039]; replace −0,00067; umbral Δacc +0,0002 | No se adopta; se reporta P(X) calibrada |
| R4 | **Poisson/DC como Motor A** | val 1,02621 vs 1,00974 de hgb (0,0165 peor) | Solo diversidad y mercados de goles |
| R5 | **Regresión entre temporadas en Elo > 0** | reg 0 → 0,5 cuesta **+0,0041** de log-loss | reg = 0 |
| R6 | **Ajustar HFA por barrido** | amplitud 0,00014 entre 40 y 90 (no identificable) | HFA = 65 por continuidad; no se interpreta |
| R7 | **Movimiento de cuotas como feature** | cierre ya lo incorpora; el movimiento añade **+0,00029** (empeora) | Solo diagnóstico, nunca feature operable |
| R8 | **Clasificador con cuotas en crudo** | HGB 0,98168 dev vs 0,99035 val (peor que de-vig 0,98984) | Prohibido como camino principal |
| R9 | **Desplegar el ensemble tras ver test** | test −0,00153 vs logit, pero la decisión se tomó **después** de congelar | **No** se cambia retroactivamente; candidato del siguiente ciclo |
| R10 | **Usar los motores legacy como modelo validado** | leakage MX/NHL; tests sin `expect`; ρ no soportado | Se conservan como *baseline* congelado |

### 2.1 Por qué R9 es una decisión de integridad, no técnica

El ensemble es estadísticamente mejor en test (−0,00153 [−0,00250, −0,00050], p=0,001). Cambiarlo ahora sería:
1. violar el protocolo pre-registrado (`FREEZE.md`: “nada se reentrena ni se reajusta después de este documento”);
2. convertir el test en un conjunto de selección, invalidando la única medición honesta que tiene el proyecto;
3. ganar 0,0015 de log-loss a cambio de perder la capacidad de afirmar nada con confianza.

**Regla para el próximo ciclo:** el ensemble se pre-registra como candidato principal y se confirma con temporada nueva (2026/27 o 2027/28), no con el test ya usado.

---

## 3. Otros cambios de infraestructura (sin efecto en métricas)

| Cambio | Motivo | Verificación |
|---|---|---|
| `features_market.parquet` regenerado | estaba en 181.268 × 192 (pre-v1.1) | ahora **182.410 × 192**; hash `360e95a2…` |
| `validation_report.json` regenerado | describía 181.272 filas | ahora 182.414; 73 checks, 0 críticos |
| `etl/tests/test_validators.py` actualizado | fijaba `rows == 181272` | **11/11 OK** (7,5 s) |
| `A06.json` creado | A06 era la única tarea sin `status` | `coordination/status/A06.json` |
| `A09_adversarial_lab.md` y `A10_integration.md` | auditoría fase 2 e integración | informes en `reports/` |
| Commit del laboratorio | estaba `untracked` | commit **`a680a4f`** |
| `folds`/`config` con hashes | trazabilidad | `FINAL/eval_test/metrics.json` |

---

## 4. Deuda que **no** se cerró

| Deuda | Impacto | Prioridad |
|---|---|---|
| 74 errores de `tsc` preexistentes (0 en rutas A10) | el build global sigue roto; el módulo nuevo compila limpio | P1 |
| UI legacy desconectada (entrypoints `football.html`/`mlb.html`/`nhl.html`) | no hay producto visual | P2 |
| Priors “S−1” solo en 88,5 % (11,5 % con temporada ≥2 atrás; NaN en cambios de división) | feature obsoleta en ascensos; no es fuga | P2 |
| Ablación de A05 no re-medida en v1.1 | las cifras de bloques son de v1.0 | P2 |
| Permutación i.i.d. (no por bloques) | p-valores optimistas frente al bootstrap | P2 |
| `fallback_motor_a` no persistido por partido en Motor B | trazabilidad del 21 % de *fallbacks* | P2 |
| xG sin licencia clara y sin cobertura histórica | familia de features ausente | P1 (roadmap) |
| Sin timestamps de cuotas | no hay CLV ni ROI verificable | P0 (roadmap) |
| Motor B mezcla fuentes (PS/B365/Avg) por época | comparaciones por liga sesgadas | P2 |

**Verificación global del estado final (A11, esta sesión):** `eval/` **83/83 OK**; `etl/` **11/11 OK**; `tests/prediction` **21/21**; `matches` 182.414 × 88; `features` 182.410 × 198; `features_market` 182.410 × 192; `metrics.json` de FINAL con B=2000 y 10.000 permutaciones.
