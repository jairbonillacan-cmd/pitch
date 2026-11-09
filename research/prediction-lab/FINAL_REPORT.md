# PitchLab Prediction Lab — Informe final del programa (ciclos 1–10)

**Fecha:** 2026-11-09 · **Rama:** `prediction-lab` · **Worktree:**
`/Users/jairbonilla/PitchLab-Prediction-Lab` (base `main@8424876`; `main` y `feat/pre-mvp` intactos).
**Autor:** Orquestador (Principal AI Engineer / Lead Quantitative Researcher) con un equipo de
subagentes reales.

---

## 1. Resumen ejecutivo

Se construyó, desde un repositorio que solo contenía motores heurísticos de terceros **sin
validación predictiva**, un laboratorio completo de forecasting con:

- **Datos históricos verificados:** 182.414 partidos de fútbol (23 divisiones, 2000/01–2026/27).
- **Motor A (sin cuotas):** regresión logística multinomial con 54 features causales; **log-loss
  1,018 en test** (16.126 partidos), frente a 1,075 de la climatología.
- **Motor B (con cuotas):** de-vig power/proporcional/Shin y stacking; **el mercado gana** por
  ~0,020 de log-loss y no se encontró edge robusto.
- **Laboratorio de backtesting** con 83 tests, walk-forward, bootstrap pareado por bloques y RPS.
- **Integración TypeScript** con paridad **4,997×10⁻¹³** y servicio con de-vig propio.
- **NFL** con nflverse (CC BY 4.0): test 0,659 vs mercado 0,627.
- **Registro de modelos, release gate, monitorización y pipeline de fixtures** (fixture → features
  con paridad 300/300 → predicción → mercado).
- **Documentación:** 16 documentos con resultados, configuraciones y limitaciones.

**Conclusión científica principal:** el motor deportivo es sólido y está bien calibrado, pero **el
mercado no es batible** con esta información: pierde +0,020 en test, +0,025 en 146 fixtures
out-of-sample y −9,7 % de ROI en 10.048 apuestas simuladas. Es la conclusión que la literatura
reciente predice, y aquí está reproducida con datos propios y evidencia auditable.

---

## 2. Evidencia de verificación (estado final)

| Comprobación | Resultado |
|---|---|
| Tests TypeScript (`npx vitest run`) | **465/465** en 13 archivos |
| Tests de evaluación (`eval/`) | **83/83** |
| Tests ETL (`etl/`) | **11/11** |
| Tests del registro (`pipeline/`) | **7/7** |
| Release gate (`validate_release.py`) | **7/7 bloques OK** |
| Registro de modelos | `motor_a_logistic_v1@1.0.0` y `nfl_logistic_v1@1.0.0`, hashes verificados |
| Árbol de git | limpio; 26 commits en la rama |
| Documentos | 16 (índice + 14 requeridos + model card) |
| Informes de subagentes | 25 |
| Estados de coordinación | 24 |

### Paridad numérica

| Artefacto | Comparaciones | max\|Δ\| |
|---|---:|---:|
| Modelo fútbol (snapshot histórico) | 600 | 4,997×10⁻¹³ |
| Modelo NFL | 600 | 4,996×10⁻¹³ |
| Peticiones de fixtures reales | 450 | 9,416×10⁻¹³ |
| Features de fixtures vs entrenamiento | 300 partidos | exacto (0 diferencias) |

---

## 3. Resultados clave (fuera de muestra)

**Fútbol — test 2024/25 + 2025/26 (16.126 partidos):**

| Sistema | Log-loss | Brier | RPS | Accuracy | ECE |
|---|---:|---:|---:|---:|---:|
| base_rate | 1,07506 | 0,65044 | 0,22784 | 0,4376 | 0,0154 |
| **Motor A (logit)** | **1,01802** | 0,60983 | 0,20820 | 0,4890 | 0,0112 |
| ensemble | 1,01652 | 0,60907 | 0,20789 | 0,4901 | 0,0047 |
| mercado cierre | **0,99770** | 0,59645 | 0,20203 | 0,5062 | 0,0063 |

**Fixtures pre-registrados (146, out-of-sample del pipeline):** modelo 0,93943 vs mercado 0,91407
(Δ +0,02536 [+0,00585; +0,04434], 99,4 % en contra).

**Simulación de valor (12.373 partidos):** ROI −9,73 % (τ=0) y −8,9 % a −11,9 % con umbrales; todos
los IC95 % negativos.

**NFL (test 2020–2025, 1.615 partidos):** `logit` 0,65906 vs mercado 0,62655 (Δ +0,0322).

**Calibración:** el ECE de 146 fixtures es ruidoso (IC95 % [0,072; 0,188]); una temperatura ajustada
fuera de muestra empeora el log-loss. No se aplica corrección.

---

## 4. Qué se construyó, por capa

| Capa | Componentes | Evidencia |
|---|---|---|
| Datos | ETL tolerante (BOM, filas irregulares, alias), validadores (73 checks), coverage | `etl/`, `data/processed/` |
| Features | Elo, forma r5/r10/EWM, descanso, congestión, priors causales, calendario | `features/build_features.py` |
| Mercado | De-vig proporcional/power/Shin, márgenes, movimiento apertura→cierre | `features/build_market_features.py` |
| Motor A | base_rate, Elo ordenado, logit, Poisson-DC, HGB, ensemble walk-forward | `models/a/` |
| Motor B | pools lineales/logit, stacking, corrección residual, ensemble | `models/b/` |
| Evaluación | Métricas contractuales, walk-forward, bootstrap por bloques, permutación | `eval/` (83 tests) |
| Integración | Inferencia TS, de-vig TS, servicio con fallback, peticiones de fixtures | `src/domain/prediction/`, 465 tests |
| Operaciones | Registro de modelos, release gate, monitorización live, snapshots de cuotas, scoring de fixtures | `pipeline/`, `registry/` |
| Expansión | NFL (dataset, modelo, TS, EPA) | `models/nfl/`, `data/nfl/` |

---

## 5. Hallazgos que cambiaron el proyecto

1. **Los motores legacy no eran un motor validado** (A01/A09): paridad con heurísticas de terceros,
   sin entrenamiento ni calibración; leakage real en Liga MX (8/9→5/9) y NHL (doble conteo).
2. **Fuga de priors S+1 en mi propio pipeline** (A05): corregida; A09b la verificó (100 % S−1) y
   midió su efecto (HGB 1,0073→1,0097).
3. **Date-cut entre calendarios** (A09b): el walk-forward mezclaba ligas europeas y de año natural;
   corregido con corte estricto por fecha.
4. **El mercado gana siempre** (A07 + test + fixtures + ROI): +0,020, +0,025 y −10 % de ROI.
5. **La calibración no es el problema** (A20): el ECE alto de una muestra pequeña no se replicó; la
   temperatura no transfiere.
6. **La expansión NHL/NCAAF está bloqueada por licencias**, no por tecnología (A17 decisión en 10).

---

## 6. Limitaciones y bloqueos externos

| Bloqueo | Impacto | Estado |
|---|---|---|
| football-data.co.uk **sin licencia publicada** | no se puede usar comercialmente sin resolver derechos | **abierto** |
| Sin cuotas históricas con timestamp | CLV real no medible; snapshots propios empezados | **parcial** |
| NHL / NCAAF sin datos con licencia clara | no-go documentado | **abierto** |
| 74 errores `tsc` legacy | `npm run build` bloqueado; el módulo nuevo compila limpio | **abierto** (deuda heredada) |
| Muestra prospectiva | 146 fixtures ya usados; hace falta predecir antes del kickoff | **pendiente** |
| xG histórico | solo 2026/27 (90–109 partidos/liga) | **limitado** |

---

## 7. Cómo continuar (para el siguiente agente)

```bash
cd /Users/jairbonilla/PitchLab-Prediction-Lab/research/prediction-lab

# 1. Estado y release
./.venv/bin/python pipeline/registry.py list
./.venv/bin/python pipeline/validate_release.py

# 2. Reproducir el motor y la evaluación
./.venv/bin/python models/a/train_motor_a.py --tag EXP01_final --no-test
./.venv/bin/python pipeline/combine_predictions.py --artifacts artifacts/EXP01_final_20261109 \
    --out artifacts/FINAL/predictions_all.csv
./.venv/bin/python -m eval.report --predictions artifacts/FINAL/predictions_test.csv \
    --matches data/processed/matches.parquet --out-dir artifacts/FINAL/eval_test

# 3. Operación semanal
./.venv/bin/python etl/capture_odds.py
./.venv/bin/python pipeline/predict_fixtures.py

# 4. Tests
cd ../.. && npx vitest run && cd research/prediction-lab && \
  ./.venv/bin/python -m unittest discover -s eval/tests -p "test_*.py"
```

**Prioridades del siguiente ciclo:** (a) predecir antes del kickoff para el test prospectivo real;
(b) resolver la licencia de datos; (c) portar `fixture_features` a TS o servir el vector desde el
backend; (d) sanear el `tsc` legacy; (e) acumular ≥1.300 partidos de 2026/27 para repetir la
calibración con potencia.

---

## 8. Mapa de documentos

`docs/predicciones/00_INDICE.md` enlaza los 14 documentos requeridos. Los informes técnicos de cada
agente están en `research/prediction-lab/reports/` y el estado estructurado en
`coordination/status/`. El registro de modelos está en `research/prediction-lab/registry/`.

**Veredicto final:** el objetivo del programa —un motor de forecasting de fútbol estadísticamente
sólido, auditado, reproducible, integrado y comparado honestamente contra el mercado, más una
extensión a NFL— **está cumplido y verificado**. Las conclusiones negativas (el mercado gana, no hay
edge de apuesta) se reportan como resultados, no como fracasos: son la evidencia que permite usar el
motor como herramienta de análisis y no como promesa de rentabilidad.
