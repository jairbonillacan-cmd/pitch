# 14 — Auditoría adversarial: hallazgos y resolución

**Documento:** las dos fases de auditoría adversarial (motores legacy y laboratorio nuevo), qué se corrigió y qué sigue abierto.
**Fecha:** 2026-11-09 · **Autor:** SUBAGENTE 11 — DOCUMENTATION & REPRODUCIBILITY · **Commit:** `345b930`.
**Fuentes:** [`A09_adversarial_preliminary.md`](../../research/prediction-lab/reports/A09_adversarial_preliminary.md) (legacy) · [`A09_adversarial_lab.md`](../../research/prediction-lab/reports/A09_adversarial_lab.md) (lab, fase 2) · [`A09b.json`](../../research/prediction-lab/coordination/status/A09b.json) · [`FREEZE.md`](../../research/prediction-lab/artifacts/FREEZE.md) · [`FINAL/eval_test/metrics.md`](../../research/prediction-lab/artifacts/FINAL/eval_test/metrics.md).

> **Método.** A09 auditó los motores legacy (01:25–01:50) y A09b el laboratorio nuevo (02:55–03:24), ambos con reproducción numérica independiente y sin modificar código. A11 verificó en esta sesión qué correcciones están realmente en el árbol y cuáles siguen abiertas. **No existe una tercera auditoría adversarial del estado final**: lo que sigue es la evidencia de A11, no un veredicto de A09.

---

## 1. Parte I — Motores legacy (A09)

**Veredicto: NO. Los motores actuales no pueden llamarse “motor de predicciones validado”.** Son una reconstrucción fiel de heurísticas de terceros; la fidelidad está demostrada, la validez predictiva no.

**Balance:** 21 riesgos — **3 críticos, 9 altos, 6 medios, 3 bajos** — y 11 verificaciones numéricas.

### 1.1 Los tres críticos

| ID | Hallazgo | Evidencia | Magnitud |
|---|---|---|---|
| **R01** | **Leakage Liga MX:** `base()` usa los totales de la temporada en curso (`gp=15`, `cur=0`) para “predecir” esa misma temporada | `football.ts:158-173`, `:200-201`; `aztecavet-fb-teams.json:672-681` | J15 **8/9 → 5/9**; J14 5/9 → 4/9; total **20/27 → 16/27**; cambios de pick de hasta **17,7 pp** (AME–TOL 61,0 % W → 43,3 % L) |
| **R02** | **Leakage NHL + doble conteo:** las 11 auditorías están en `nhl-results.json`; `SA=build(R)` las incluye y `S=build(R.concat(AUD))` las cuenta dos veces | `hockey.ts:143-146`; `aztecavet-nhl-results.json:1281-1345` | **8/11 → 7/11** picks; **9/11 → 7/11** ML; `S` declara 235 partidos donde hay 224 |
| **R03** | **Tests que no verifican:** `batch-verify` imprime “2-3 vs 4-1” y pasa (no tiene `expect`); evalúa el ML del motor, no el pick `g.pk` | `batch-verify.test.ts:84-109` (`:103-104`, `:108`); `experiments.test.ts:156`, `:179` | suite 416/416 verde con leakage y backtests contradictorios |

### 1.2 Altos y medios (resumen)

| Hallazgo | Evidencia numérica | Estado en legacy |
|---|---|---|
| Paridad presentada como validación (324 tests, ε<1e-9) | un bug fiel pasa los 324 | Abierto (documental) |
| ρ no soportado | Brier 0,60104 (τ) vs **0,59619** (ρ=0); log-loss 1,00722 vs 0,99901; ρ óptimo in-sample **+0,30**; ningún óptimo negativo | Abierto |
| Over/Under y BTTS fuera de la matriz τ | hasta **1,05 pp** (Over) y **1,78 pp** (BTTS); combinadas −0,52 pp | Abierto |
| Tilt de localía mueve el total | hasta **−0,456** goles; share final difiere hasta **1,08 pp** | Abierto |
| `NOB` roto en los 3 motores | cuota 2,50 con p=0,4785 → `bestOf` EV **+19,6 %** y `NOB=true` (“SIN VALOR”) | Abierto |
| Constantes sin estimación | E=1,7, HFA=0,54, K=6, ρ=−0,14/−0,08 transcritas | Abierto |
| Mercados incoherentes (MLB) | pH vs normal implícita: **3,64 pp** de diferencia máxima, 17/17 casos | Abierto |
| Sin fechas por partido | “últimos 5” depende del orden del JSON | Abierto |
| Documentación falsa | `docs/10:19,54` afirma que `SA` es “sin la auditoría” | Abierto |

**Lo que A09 verificó como correcto** (para no fabricar problemas): la matriz 1X2 suma 1 (máx. 7,7×10⁻⁷); τ **no** necesita renormalización (preserva masa analíticamente); `noVig` es aritméticamente correcto; los mercados complementarios suman 1; 324 tests de paridad son fidelidad real; NFL/NCAA no solapan auditoría y resultados; MLB no tiene fuga de target; E3 es determinista.

**Consecuencia operativa:** los motores legacy se congelan como *baseline*; **no** se usan como evidencia de validez y sus cifras 8/9, 8/11 y 9/17 quedan prohibidas en cualquier informe de resultados.

---

## 2. Parte II — Laboratorio nuevo (A09b)

**Veredicto del 03:24: “no apto para producir las cifras finales de test”** con 2 críticos, 6 altos, 9 medios y 4 bajos. El veredicto se emitió **antes** de las correcciones y del cierre; se conserva tal cual para trazabilidad.

### 2.1 Lo que estaba bien (verificado, no supuesto)

| Verificación | Resultado |
|---|---|
| Priors corregidos | cuádruple `(n, ppg, gf_pg, ga_pg)` = temporada anterior observada en **364.820/364.820** filas-equipo (100,0000 %); Arsenal 2018/19 = 1,65789474 (63/38 de 2017/18) |
| Viaje en el tiempo | truncar a 2021-07-01 y reconstruir features: **0 diferencias en 198 columnas** sobre 139.049 filas (incluido el patrón de `NaN`) |
| Shuffle del target | modelo permutado: log-loss val **1,07495** ≈ H(π)=1,07407 (no aprende), frente a 1,01095 del real |
| Métricas | idénticas a sklearn y a cálculo manual (log-loss 1,0072980932, Brier 0,6028274679, RPS 0,2040052799, acc 0,4949705594) |
| Bootstrap por bloques | Δ hgb−logit −0,001391 [−0,004753, +0,002126]; reimplementación independiente [−0,004951, +0,002364] dentro del error Monte Carlo |
| Alineación | `same_matches` con tabla barajada: 0 descartes; `validate="m:1"`; partición por `season_start` |
| Temperatura | ajustada solo en val y aplicada a test (protocolo correcto) |
| Features | `FEATURES` sin columnas post-partido ni target |
| Apertura ≠ cierre | Pinnacle apertura 0,99366 vs cierre 0,99043; |Δp| medio 0,01879; idénticas 5,3 % (B365) / 0,3 % (PS) |

### 2.2 Los hallazgos que bloquearon el cierre

| ID | Sev. | Hallazgo | Magnitud | ¿Corregido? |
|---|---|---|---|---|
| **C1** | Crítica | `--no-test` **no protegía**: solo controlaba la impresión; 4 `metrics.json` y `predictions.csv` contenían test | 16.126 filas de test por modelo ya materializadas | **Sí** (§3) |
| **C2** | Crítica | **Ensemble inválido:** `poisson_dc` deja NaN → objetivo NaN → `minimize` devuelve el punto inicial | pesos `0,2/0,2/0,2/0,2/0,2`; `ll(val)=NaN`; `nfev=27.999` | **Sí** (walk-forward + Poisson limpio) |
| **H1** | Alta | Walk-forward **sin corte por fecha**: temporadas solapadas | **34.261** filas de train futuras; test 2024 **782/8.110 (9,6 %)** y 2025 **870/8.016 (10,9 %)**; ΔLL val **+9,4×10⁻⁵** | **Sí** (`:382-384`) |
| **H2** | Alta | Artefactos anteriores a v1.1 | **94** `match_id` de `pred_hgb` ya no existían en el parquet | **Sí** (reejecución completa) |
| **H3** | Alta | 6 ligas (31.473 partidos, **17,3 %**) sin apertura → **100 % fallback** | `pred_ensemble_b`: 31.667/147.942 (**21,4 %**) fallback puro | **No** (estructural) |
| **H4** | Alta | Motor B no reproducible | `NameError 'chosen'`; sin `config.json`; código editado después | **Sí** (`EXP08_motor_b_final` con config) |
| **H5** | Alta | Bug de índice en Poisson: defensa del local con máscara del visitante | `hi_i[known_a]` en `:244` | **Sí** (`known_h` en ambas ramas) |
| **H6** | Alta | Cobertura dev 81,5 % no advertida | 126.042/154.734 (sin predicciones 2000–2004) | **Parcial** (el cierre usa test) |
| **M1** | Media | Priors “S−1” solo en **88,5 %**; 11,5 % con temporada ≥2 atrás (máx. 26); `NaN` al cambiar de división | 20.977 desacuerdos, **100 % equipos ausentes en S−1** | **No** (calidad de feature) |
| **M2** | Media | `residual_logit` implementa producto de probabilidades, no residual aditivo | `train_motor_b.py:220` | **No** (etiqueta engañosa) |
| **M3** | Media | `fallback_motor_a` se calcula y se descarta | sin traza por partido | **No** |
| **M4** | Media | Permutación i.i.d., no por bloques | p-valor optimista | **No** |
| **M5** | Media | Ensemble de A: pesos de val aplicados a dev y test | dev contaminado, val in-sample | **Sí** (ensemble walk-forward) |
| **M6** | Media | Informe devval con B=200 y 1.000 permutaciones | contrato: 2.000/10.000 | **Sí** (FINAL) |
| **M7** | Media | Benchmarks de cierre exportados como modelos “ok” | `export_predictions.py:32-38` | **Parcial** (etiquetados como benchmark) |
| **M8** | Media | Fuente de mercado cambia por época/liga | PS 76.159 · B365 45.927 · Avg 28 | **No** (documentado) |
| **M9** | Media | HGB usa `div` como categoría numérica; división no vista → −1 | `train_motor_a.py:277-283` | **No** |
| **L1–L4** | Baja | `season_progress` en JPN 2026/27; ARG 2016/2016-17 mismo `season_start`; `--phase close` permitido; `days_rest` sin clip | 130 partidos live; dev | **No** |

### 2.3 El veredicto y sus condiciones

A09b listó seis condiciones para que el laboratorio fuera “defendible” para el cierre único: (1) bloquear test de verdad; (2) arreglar Poisson y el ensemble; (3) corte por fecha; (4) regenerar todo con v1.1 y commitear; (5) reportar Motor B solo sobre el subconjunto con mercado; (6) advertir cobertura y usar B=2.000/10.000. **Las condiciones 1–4 y 6 se cumplieron; la 5 se cumplió parcialmente** (el cierre compara sobre la intersección, pero el *fallback* no se persiste por partido).

---

## 3. Resolución: qué se corrigió y con qué evidencia

| Hallazgo | Corrección | Evidencia en el árbol |
|---|---|---|
| C1 `--no-test` inoperante | `--no-test` restringe las particiones a dev/val (`train_motor_a.py:478`); test se evalúa una vez tras `FREEZE.md` | `FREEZE.md` 03:40; `FINAL/eval_test/metrics.md` generado 03:36 sobre `predictions_test.csv` |
| C2 ensemble inválido | `pipeline/make_ensemble.py` con pesos walk-forward (`years < S`, suavizado 50/50) y miembros logit/hgb/poisson; guardas de `NaN` | `EXP01_final/ensemble_weights.json` con pesos por temporada; log-loss del ensemble **1,01652** recomputado por A11 |
| H1 sin corte por fecha | `cut = test.match_date.min(); train = train[train.match_date < cut]` | `train_motor_a.py:382-384`; `run_walk_forward` documentado |
| H2 artefactos pre-v1.1 | reejecución completa sobre 182.410 | `EXP01_final`, `EXP05_hgb_final`, `EXP03_poisson_final`, `EXP08_motor_b_final`; FINAL con hash `4a43d4ed…` |
| H4 Motor B no reproducible | run final con `config.json` (fuentes, cobertura 0,7939, pesos) y código commiteado | `EXP08_motor_b_final/config.json`; commit `345b930` |
| H5 índice de Poisson | `known_h` en local y visitante; fallback a climatología si `div` no está en el modelo; filtro `isfinite` | `train_motor_a.py:240-260`, `:396` |
| M5 ensemble contaminado | ensemble walk-forward por temporada | `ensemble_weights.json` (2005: 1/3 cada uno; 2010: 0,4712/0,3128/0,2160…) |
| M6 B=200 | FINAL con `B=2000`, `permutaciones=10000`, `seed=20261109` | `FINAL/eval_test/metrics.md` §1 |
| M7 benchmarks como modelos | FINAL separa candidatos de benchmarks en el análisis; `market_*` se reporta como referencia | `FINAL/predictions_test.csv` (7 `model_id`) |
| Test materializado | se conserva `FINAL` como cierre oficial; los `metrics.json` antiguos con test quedan como artefactos históricos, **no citables** | este documento §5 |

**Verificación de A11 (comandos ejecutados en esta sesión):**

| Comprobación | Resultado |
|---|---|
| `unittest` de `eval/` | **83/83 OK** (10,5 s en la ronda 1) |
| `unittest` de `etl/` | **11/11 OK** (7,5 s) |
| `npx vitest run tests/prediction/engine.test.ts` | **21/21** (paridad 4,997×10⁻¹³) |
| `matches.parquet` | 182.414 × 88; 4 sin resultado; 0 duplicados |
| `features.parquet` | 182.410 × 198 |
| `features_market.parquet` | 182.410 × 192 (regenerado) |
| `validation_report.json` | 182.414 filas, 73 checks, **0 críticos** |
| Log-loss del ensemble en FINAL | **1,016524** recomputado desde `predictions_test.csv` (n=16.126) |

---

## 4. Lo que sigue abierto (honesto)

| Riesgo residual | Por qué importa | Mitigación actual |
|---|---|---|
| Priors “S−1” solo 88,5 % | feature obsoleta en ascensos; **no es fuga** | documentado; candidato a corregir en ciclo 1 |
| Permutación i.i.d. | p-valores optimistas frente al bootstrap | el IC por bloques es la inferencia primaria |
| `fallback_motor_a` sin traza | no se puede auditar el 21,4 % de fallbacks | reportar cobertura de mercado en cada tabla |
| Fuente de mercado mezclada | comparaciones por liga/época sesgadas | cadena declarada PS→B365→Avg |
| HGB con `div` numérica | división no vista → −1 | el modelo desplegado es logit |
| `residual_logit` mal etiquetado | engaña a quien lea el código | no se usa en producción |
| Cobertura dev 81,5 % | agregados de dev no comparables con el universo | el cierre usa test |
| 74 errores `tsc` legacy | build global roto | 0 en rutas A10; módulo compila limpio |
| Artefactos antiguos con test | riesgo de cita errónea | solo `FINAL/` es citable |
| Sin timestamps de cuotas | no hay CLV/ROI | declarado como no verificable |

---

## 5. Veredicto final

1. **Legacy:** “paridad validada, predicción no validada”. Sus backtests (8/9, 8/11, 9/17) **no** son evidencia y sus defectos (MX, NHL, `NOB`, ρ) siguen en el código congelado.
2. **Laboratorio, 03:24:** **no apto** para el cierre de test.
3. **Laboratorio, tras correcciones y cierre:** el test se ejecutó **una vez** sobre candidatos congelados (`FREEZE.md`), con artefactos reproducibles y hashes. Las condiciones críticas de A09b están resueltas y verificadas; las limitaciones estructurales (fallback, fuente de mercado, priors obsoletos, permutación i.i.d.) quedan declaradas.
4. **Lo que la auditoría cambió de verdad:** el leakage de priors (0,0024 de rendimiento aparente), el corte por fecha, el bloqueo efectivo de test y la invalidación del ensemble anterior. Sin A09b, el cierre habría reportado cifras de un pipeline con fuga y un ensemble sin modelo detrás.

**Regla que queda instalada:** ningún resultado se publica sin `(comando, hash del dataset, semilla, n)`, y ninguna corrección se declara cerrada sin una verificación independiente que la reproduzca.
