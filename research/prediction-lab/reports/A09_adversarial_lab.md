# A09b — Auditoría adversarial del laboratorio nuevo (fase 2)

**Agente:** ADVERSARIAL MODEL AUDITOR · **Fecha:** 2026-11-09 03:25 (America/Mexico_City)
**Alcance:** código y datos del laboratorio `research/prediction-lab/` (no motores legacy, ya auditados en `A09_adversarial_preliminary.md`).
**Snapshot auditado:** `features/build_features.py` mtime 02:52, `models/b/train_motor_b.py` 02:48, `eval/report.py` 01:43, `models/a/train_motor_a.py` 03:14 (el orquestador lo editó durante la auditoría; los números de línea citados son de esa versión y pueden desplazarse).
**Datos:** `matches.parquet` 182.414 filas (182.410 con resultado, 0 `match_id` duplicados), `features.parquet` 182.410 × 198, `features_market.parquet`.
**Test:** no se ha usado para entrenar, elegir ni comparar nada. Se observó únicamente que existen métricas de test persistidas en artefactos (§3.4); no se leen aquí como resultado.

Código y comandos: todo lo de abajo se ejecutó con `./.venv/bin/python` sobre este worktree; los scripts de auditoría viven en `/tmp/a09/` y no tocan el repo.

---

## 0. Veredicto ejecutivo

- **El fix de priors es correcto y elimina el leakage de A05**: en 364.820 filas-equipo el cuádruple `(n, ppg, gf_pg, ga_pg)` coincide **al 100,0000 %** con la temporada anterior *observada* del equipo; 0 coincidencias sistemáticas con S ni S+1. Pero **no es exactamente "S-1"**: el 11,50 % de las filas usa una temporada ≥2 anterior (hasta 26) y los equipos que cambian de división quedan a `NaN`.
- **No hay fuga de features ni de target**: el test de viaje en el tiempo reproduce **0 diferencias en las 198 columnas** sobre 139.049 filas, y el test de permutación cae en la entropía de la etiqueta (1,07495 vs 1,07407), no por debajo.
- **Sí hay fuga temporal en el walk-forward** (`train = df[df.sstart < s]` sin corte por fecha): 34.261 filas de entrenamiento están fechadas después del primer partido de su fold; en test 2024/2025 afecta a 782/870 filas (9,6 %/10,9 %). Impacto medido en val: +9,4e-5 de log-loss (pequeño, pero estructural).
- **El laboratorio NO es apto para producir las cifras finales de test** tal como está: `--no-test` no protege (las métricas de test se calculan y se escriben igual), el ensemble reportado es numéricamente inválido (NaN de Poisson → pesos = punto inicial), y los artefactos existentes son anteriores al rebuild v1.1 de datos.

---

## 1. Verificación independiente del fix de priors (T1)

Recalculado desde `matches.parquet` (agregado por `div, team, season`, sólo partidos con resultado) y contrastado con `features.parquet` en las 182.410 filas (2 lados = 364.820 filas-equipo). Script: `/tmp/a09/t1_priors.py`, `/tmp/a09/t1b_priors.py`.

| Comprobación | Resultado |
|---|---|
| Cuádruple `(n, ppg, gf_pg, ga_pg)` = temporada anterior **observada** del equipo | **100,0000 %** (364.820/364.820) |
| Muestra aleatoria 5.000 filas, `home_prev_ppg` = S-1 inmediata de la división | 87,38 % (el resto: el equipo no jugó S-1) |
| Muestra 5.000, `away_prev_ppg` = S-1 inmediata | 87,72 % |
| Igual a la temporada propia (S) | 2,36 % / 2,46 % — **coincidencia de ratios**, no de origen (el cuádruple no coincide) |
| Igual a la temporada siguiente (S+1) | 1,52 % / 1,84 % — coincidencia de ratios |
| E0 completa (n=9.970) = S-1 | 90,52 % (h) / 90,53 % (a) |
| SP1 completa (n=9.989) = S-1 | 89,75 % |
| MEX completa (n=4.789) = S-1 | 99,56 % |
| Tasa de `NaN` en priors | 10,49 % global (8,8–9,4 % en E0/SP1/MEX) |
| Filas con prior de ≥2 temporadas atrás | **11,50 %** de las no nulas (máx. 26 temporadas) |

Ejemplo canónico (el de A05): Arsenal 2018/19 tiene `home_prev_ppg = away_prev_ppg = 1,65789474` = 63/38 de **2017/18**; la 2018/19 propia es 1,842105 (70 pts) y no aparece. Correcto.

Causa de los 20.977 desacuerdos con "S-1 inmediata": **el 100 % son equipos ausentes en S-1** (ascendidos/descendidos o con hueco). El código agrupa por `(div, team)` (`build_features.py:165-178`), así que un equipo que cambia de división arranca con `NaN` y uno que vuelve usa la última temporada que jugó *en esa división*. Ejemplos con ≥100 filas: Charlton (E1) 138, Palermo y Empoli (I2) 122, Bochum y FC Köln (D2) 102; el máximo es 26 temporadas atrás.

**Conclusión T1:** el shift está bien aplicado y **no hay leakage futuro**; la afirmación "corresponde a la temporada anterior" es cierta sólo para el 88,5 % de las filas. Es un problema de **calidad de feature** (priors obsoletos, `NaN` en ascensos), no de fuga. Si se quiere "S-1 exacto", hay que agregar por `team` (no por `div, team`) y caer a `NaN` si falta S-1.

Matices de calendario detectados (afectan a `season_progress`, no a priors):
- `ARG` mezcla etiquetas `2016` y `2016/17` con el **mismo `season_start`=2016** (242 + 450 partidos, en dev): el shift lexicográfico ordena bien (`2016` < `2016/17`) pero `season_start` por sí solo no distingue ambas temporadas.
- `JPN` usa `2026/27` en una liga de año natural: `season_progress` toma 0,10–0,34 (calendario jul–jun) cuando el valor de año natural sería 0,60–0,84; son 130 partidos **live** (`build_features.py:206-217`). Severidad baja (live, y A05 midió que `season_progress` no aporta).

---

## 2. Test de viaje en el tiempo del pipeline completo (T2)

Procedimiento: copia de `features/build_features.py` en `/tmp/a09/tm/`, `matches.parquet` truncado a `match_date < 2021-07-01` (139.052 filas) en `/tmp/a09/tm/data/processed/`, ejecución completa del script y comparación por `match_id` contra `features.parquet` para las filas anteriores al corte.

```
full rows 182410 | rebuild rows 139049 | columns equal: True
full rows before cut 139049 | rebuild rows before cut 139049
columns with ANY difference: 0        (198/198 idénticas, incl. NaN pattern)
elo_diff max_abs_diff 0.000e+00 | home_prev_ppg 0.000e+00 | season_progress 0.000e+00
h_days_rest 0.000e+00 | lg_avg_total_prev 0.000e+00 | home_season_match_no 0.000e+00
```

**PASS.** Cero diferencias en las 198 columnas y 139.049 filas. Esto descarta dependencias del futuro en la construcción (incluida la antigua `season_progress` con `max(match_date)` y los priors); contrasta con las 12 columnas que A05 encontró distintas con el código anterior. Limitación del test: no detecta fuga intradía (dos partidos del mismo equipo el mismo día), inexistente en estos datos.

---

## 3. Auditoría del entrenamiento — Motor A (`models/a/train_motor_a.py`)

### 3.1 ¿Train de cada fold sólo temporadas < S? Sí, pero por etiqueta, no por fecha

`run_walk_forward` usa `train = df[df.sstart < s]` (l. 366). El problema es que las temporadas **se solapan en el calendario**: desde 2012 conviven ligas de año natural (ARG, BRA, USA, SWE, JPN, MEX) con las europeas, y el fold "2023" empieza el 2023-01-27 (partido argentino). Por tanto el train incluye partidos europeos de feb–jun 2023, posteriores a partidos que se predicen.

| Fold | n_train | filas de train con fecha ≥ 1.er partido del fold | train_max | test_min |
|---|---|---|---|---|
| 2005–2011 | 28.608–63.242 | 0 | jun | jul/ago |
| 2012 | 68.970 | 1.603 | 2012-06-03 | 2012-03-10 |
| 2019 | 123.591 | 2.086 | 2019-06-09 | 2019-02-22 |
| **2023 (val)** | 154.734 | **2.842** | 2023-06-07 | 2023-01-27 |
| **2024 (test)** | 162.886 | **2.751** | 2024-06-02 | 2024-01-25 |
| **2025 (test)** | 170.996 | **2.667** | 2025-06-01 | 2025-01-23 |

Total: **34.261 filas de train futuras** respecto a su fold. En test, **782/8.110 filas (9,6 %) de 2024 y 870/8.016 (10,9 %) de 2025** se predicen con un modelo entrenado con datos posteriores a su fecha.

Magnitud medida (logit, dev→val, mismo preprocesado): sin corte 1,010950 (acc 0,49497) vs con corte `match_date < 2023-01-27` 1,010856 (acc 0,49485) → **ΔLL = +9,4e-5**. Es pequeño, pero es una fuga real y en test afecta a más filas; no hay razón para no corregirla. `eval/splits.py` ya implementa el corte (`date_cut=True`, `n_train_dropped_date`), pero **ningún modelo lo importa** (`grep -rn "eval" models/ pipeline/` sólo encuentra `market_common.py`). Severidad: **ALTA**.

### 3.2 Ensemble: pesos de val aplicados a dev y a test, y además inválidos

`train_motor_a.py:471-500`: los pesos se ajustan con las predicciones de **val 2023** (`ensemble_weights`, l. 342-355, l. 492) y se aplican a **todos** los `match_id`, incluidos dev y test (l. 496). Consecuencias:

1. **Dev no es honesto** para el ensemble: los pesos vieron 2023 antes de puntuar ≤2022. La métrica `metrics["ensemble"]["dev"]` no es out-of-sample.
2. **Val es in-sample** para los pesos: no puede reportarse como OOS del ensemble.
3. Test sí es temporalmente posterior a val, pero el peso es único y global (no walk-forward), a diferencia de `pipeline/make_ensemble.py`, que sí lo hace bien (pesos por temporada con `years < s`, suavizado 50/50) y **no se está usando** (no hay `pred_ensemble.csv` en `artifacts/EXP01_baselines_20261109/`).

Además el ensemble actual es **numéricamente inválido**: `poisson_dc` deja `NaN` y el objetivo de `ensemble_weights` se vuelve `NaN`; `minimize` devuelve el punto inicial y el artefacto registra `{"base_rate":0.2,"elo_ordered":0.2,"logit":0.2,"poisson_dc":0.2,"hgb":0.2}`. Verificado: `ll(val)` con esos "pesos" = **NaN**, y un Nelder-Mead sobre la misma matriz devuelve exactamente 0,2 con `nfev=27.999` (todos los valores `NaN`). No hay guarda de `NaN` en `_log_loss`/`ensemble_weights`. Severidad: **CRÍTICA** (cifra reportada sin modelo detrás).

### 3.3 Temperatura: correcta

`temperature_scale` se ajusta **sólo en val** (l. 551-559) y se aplica a test (l. 563), no a val/dev. `metrics[...]["test_calibrated"]` sólo se calcula si `not args.no_test`. Protocolo correcto. Matiz: las temperaturas se escriben siempre en `metrics.json`, y para modelos con `NaN` (Poisson) el `temperature_scale` también devuelve 1,0 por el `NaN` (grid degenerado); no afecta a test pero es otra salida silenciosa.

### 3.4 `--no-test` no protege

El flag sólo controla la **impresión** (l. 547). Las métricas se calculan para `dev/val/test/live` antes (l. 464-467) y el `payload` las escribe siempre (l. 569-573). Evidencia:

- `artifacts/EXP01_baselines_20261109/metrics.json`, `EXP01_smoke_20261109`, `EXP03_poisson_fix`, `EXP03_poisson_v2`: **los cuatro contienen bloque `test`**; el informe `eval_devval/metrics.json` además contiene cobertura de test (16.126).
- `artifacts/EXP01_baselines_20261109/predictions.csv`: 16.126 filas de test por modelo (incluidos los benchmarks `market_close_*`); el fichero `predictions_devval.csv` se generó aparte, pero el completo sigue en el artefacto.
- `eval/report.py` tampoco tiene guarda: si el CSV trae filas de test, las evalúa y las escribe.

No consta que el orquestador haya usado esos números para elegir, pero **el control es inoperante y el test ya está materializado**. Severidad: **CRÍTICA** para el protocolo ("test una sola vez").

### 3.5 ¿Métricas de dev honestas?

- Por modelo: sí en lo esencial — cada temporada se predice con un modelo entrenado con temporadas anteriores (walk-forward), sin reentrenar con su propio año. Además `FEATURES` (l. 46-59) no contiene columnas post-partido ni target y hay guarda nominal (l. 401-404).
- Salvedades: (a) ensemble dev contaminado (§3.2); (b) dev cubre sólo 126.042 de 154.734 partidos (**81,5 %**), porque las predicciones empiezan en 2005/06 — el informe no lo advierte (§5.4); (c) los priors obsoletos (§1) degradan dev de forma heterogénea (ascendidos a `NaN`).
- **Poisson DC deja NaN** y arrastra `metrics["poisson_dc"]["dev"] = NaN` en el artefacto: 12,76 % de filas en `EXP01_baselines` (19.624/153.802) y 1,44 % (2.221) en `EXP03_poisson_v2`. Causa reproducida: una **división sin datos de entrenamiento** deja `predict_proba` en `NaN` (`if div not in self.models: continue`, l. 226) — las 7 celdas del v2 son exactamente las ligas nuevas: ARG 2012/13 (381/381), BRA 2012 (380/380), USA 2012 (338/338), MEX 2012/13 (334/334), JPN 2012 (306/306), SWE 2012 (242/242), G1 2005/06 (240/240). Reproducido con un caso sintético: 400/400 `NaN`.
- Bug adicional en el mismo método: en las filas de visitante la defensa del local se indexa con la máscara del visitante — `X[len(g)+rows[known_a], n + hi_i[known_a]]` (l. 244) — cuando debería ser `known_h`. Con un equipo desconocido y el otro conocido asigna el coeficiente de defensa de **otro equipo** (o lo omite). No produce NaN, pero sesga las cuotas de esos partidos. Severidad: **ALTA** (correctitud, no fuga).

---

## 4. Auditoría de Motor B (`models/b/train_motor_b.py`)

### 4.1 "Apertura" = cuota pre-cierre, con supuesto explícito; verificado que no es el cierre

`etl/build_matches.py:47-58`: `odds_open_*` ← `B365H/PSH/AvgH/MaxH/BFH/BFEH`; `odds_close_*` ← columnas `*C*`. El docstring de `train_motor_b.py:13-15` declara el supuesto ("open = cuotas de apertura, pre-partido") y que el cierre es sólo benchmark. Contraste empírico (76.141 partidos con Pinnacle apertura y cierre):

| | Log-loss | |
|---|---|---|
| Pinnacle apertura (power) | 0,99366 | |
| Pinnacle cierre (power) | 0,99043 | |
| Δ medio |p_open − p_close| | 0,01879 (máx 0,3178) | |
| Cuotas idénticas | 5,3 % (B365), 0,3 % (Pinnacle) | |

Es una instantánea **genuinamente anterior** al cierre (~0,003 de LL), no el cierre disfrazado. Pero football-data no publica timestamp: no se puede probar que esas cuotas fueran apostables en el momento declarado. Severidad: **MEDIA** (supuesto documentado, no verificable).

### 4.2 Cobertura: 6 ligas sin apertura → fallback sistemático, no aleatorio

| División | Partidos | Apertura Pinnacle | Apertura B365 | Cierre Pinnacle |
|---|---|---|---|---|
| ARG, BRA, JPN, MEX, SWE, USA | **31.473 (17,3 %)** | **0,0 %** | **0,0 %** | 91,7–96,8 % |
| 17 divisiones europeas | 150.941 | ~46–53 % | ~90–93 % | ~48–53 % |

Los CSV "extra" sólo traen columnas de cierre (`PSCH…`, `B365CH…`); no hay apertura en la fuente. Por tanto el escenario "market open" de Motor B **no existe** en esas 6 ligas y cae al 100 % a Motor A. Cobertura global de mercado: 75,9 % de los partidos (79,4 % en el run, que empieza en 2005/06); `pred_ensemble_b` = 147.942 filas, de las que **31.667 (21,4 %) son fallback puro**. La comparación "Motor B vs Motor A" sobre el universo completo mezcla 21 % de filas idénticas a Motor A y está sesgada por liga. Severidad: **ALTA** (interpretación de resultados).

### 4.3 Fuente de mercado por partido: cambio determinista por época/liga

Cadena `ps_power → b365_power → avg_power → ps_prop → b365_prop` (`l.133-148`, el primero sobrescribe). Reparto: **ps_power 76.159, b365_power 45.927, avg_power 28**. Por temporada, B365 domina 2002–2011 y Pinnacle 2012+; por división es ~50/50 dentro de Europa. No es aleatorio: la fuente está determinada por la época y la liga (Pinnacle no cubre divisiones menores). El método de de-vig es siempre "power", así que el sesgo es de **bookmaker**, no de método. Severidad: **MEDIA** (documentar y reportar por subconjunto).

### 4.4 Stacker, fuga por cierre y fallback

- Stacker/mezclas se entrenan **sólo con temporadas < S** (`train = df[df.sstart < s]`, l. 162; `tr = train[train.market_ok]`, l. 166). Correcto en lo temporal, con la misma salvedad de fechas de §3.1 (mismo `sstart`, sin corte por fecha).
- **No hay fuga por `mkt_close_*`**: la fase open sólo selecciona `mkt_open_{src}_{method}_{k}` (l. 133-137); las columnas de cierre se mergean pero no se usan. `--phase close` existe (l. 111) y produciría un escenario no operable; es una guarda de seguridad ausente, no un uso real.
- Fallback correcto en lo numérico (`fallback()` l. 99-104; sustituye `NaN`/suma≤0 por `pA`), verificado: `pred_ensemble_b` con 0 `NaN` y suma 1±1e-6. **Pero el flag `fallback_motor_a` que promete el docstring (l. 15) se calcula (`fb`) y se descarta**: no queda traza por partido en las predicciones. Severidad: **MEDIA** (trazabilidad).
- `residual_logit` no implementa lo que documenta: `softmax(log pM + log(corr))` (l. 220) es el producto normalizado `pM ⊙ corr`, no un residual aditivo `softmax(log pM + g(x))`. Es un pool geométrico válido, pero la etiqueta engaña. Severidad: **MEDIA**.
- Pesos de `ensemble_b` ajustados en **val 2023** (l. 244-251) y aplicados a todo, dev incluido: misma contaminación que §3.2 (dev no honesto, val in-sample). Severidad: **MEDIA**.
- **Artefactos no reproducibles:** el run `EXP08_motor_b_open2` murió con `NameError: name 'chosen' is not defined` en la l. 265 de la versión de entonces (`logs/EXP08_motorB_open2.log`), sin `config.json`, después de escribir los `pred_*.csv`; el script se editó después (mtime 02:48). `EXP08_motor_b_open_20261109` viene de una versión con fuente única (`ps_power`) que ya no existe. Ninguno de los dos se puede regenerar con el código actual. Severidad: **ALTA** (reproducibilidad).

---

## 5. Auditoría del evaluador (`eval/`)

### 5.1 Métricas: correctas (contraste con sklearn y cálculo manual)

Sobre `pred_hgb.csv`, val 2023 (n=8.152):

| Métrica | `eval.metrics` | sklearn / manual | Δ |
|---|---|---|---|
| Log-loss | 1,0072980932 | 1,0072980932 (sklearn) | 0 |
| Brier | 0,6028274679 | 0,6028274679 (suma de `brier_score_loss` por clase / manual) | 0 |
| RPS | 0,2040052799 | 0,2040052799 (manual, CDF/2) | 0 |
| Accuracy | 0,4949705594 | 0,4949705594 | 0 |

`metrics.py` aplica bien el recorte 1e-15 sólo al log-loss y renormaliza para Brier/RPS; el RPS divide por `K-1=2`. Sin hallazgos.

### 5.2 Bootstrap y alineación: correctos

- `paired_bootstrap_delta` (B=2000, semilla 20261109) sobre hgb−logit en val: Δ = −0,001391, IC95 [−0,004753, +0,002126], 23 bloques. Reimplementación independiente (remuestreo de bloques por índice, no multinomial): IC [−0,004951, +0,002364]. Diferencia dentro del error Monte Carlo → implementación correcta.
- `same_matches` con la tabla de un modelo **barajada**: n=8.152, `match_id` y `y` alineados 1:1, 0 descartes. `strict=False` reporta `n_only_a/b`. Correcto.
- `_comparison_entry` exige etiquetas iguales para los mismos `match_id` y aborta si no.
- `prepare_frame` hace `merge` inner con `validate="m:1"`, rechaza duplicados `(match_id, model_id)` y desajustes de metadatos; la partición se asigna por `season_start` (l. 320-322), no por el string de temporada. Correcto y consistente con el contrato.

### 5.3 Comparaciones: el test de permutación ignora los bloques

`permutation_test_delta` (l. 194-228) permuta **signos i.i.d.**, no bloques; con 23 bloques temporada×división y dependencia serial, el p-valor es optimista frente al bootstrap. El IC por bloques es la inferencia primaria y así se documenta, pero conviene un permutación por bloques. Severidad: **MEDIA-BAJA**.

### 5.4 Denominadores y cobertura

- `coverage.matches_with_result` = 182.410 (tras filtrar fechas no parseables); `matches_rows_total`=182.414. Nombre engañoso, sin impacto.
- **Cobertura de dev no advertida**: el informe dice dev=154.734 partidos y el modelo tiene n=126.042 (81,5 %), porque no hay predicciones 2000–2004. `build_report` sólo avisa de particiones ausentes (`test`, `live`), no de una cobertura parcial de dev con 28.692 partidos fuera. Severidad: **MEDIA** (los agregados de dev no son comparables con el universo).
- El informe `artifacts/EXP01_baselines_20261109/eval_devval/metrics.json` usó **B=200 y 1.000 permutaciones** (contrato: 2.000/10.000). Está registrado en `config`, pero no cumple el contrato. Severidad: **MEDIA**.
- `export_predictions.py:32-38` inyecta 5 modelos `market_close_*`/`market_open_*` en `predictions.csv` con `data_quality_flag="ok"`, como si fueran candidatos; el informe los trata como modelos (108 comparaciones en devval). Es un benchmark, no un candidato. Severidad: **MEDIA** (higiene de comparaciones).

---

## 6. Test de permutación del target ("shuffle") (T6)

Logit (mismo pipeline que `fit_logit`: imputer mediana + scaler + LR C=1) entrenado en dev ≤2022 (n=126.126) y evaluado en val 2023 (n=8.152), semilla 20261109.

| Target | Log-loss train | Log-loss **val (OOS)** | Accuracy val |
|---|---|---|---|
| Real | 1,01263 | **1,01095** | 0,4950 |
| Permutado | 1,06743 | **1,07495** | 0,4389 |
| Referencia | — | log(3) = 1,09861 · H(π_val) = 1,07407 | — |

El modelo permutado queda en **H(π)+0,00089** (no aprende nada) y no por debajo de la entropía; la diferencia de −0,0237 frente a `log(3)` se explica íntegramente por el desbalance de clases (H(π)=1,07407). No hay fuga de target en el pipeline. El modelo real gana 0,0631 de log-loss frente a la climatología.

---

## 7. Registro de riesgos

| # | Sev. | Riesgo | Evidencia |
|---|---|---|---|
| C1 | **Crítica** | Test evaluado y persistido pese a `--no-test`; no hay guarda en trainer ni en evaluador | `train_motor_a.py:464-467, 547, 569-573`; 4 `metrics.json` de `train_motor_a` con bloque `test` (+ cobertura test en devval); `predictions.csv` con 16.126 filas test/modelo |
| C2 | **Crítica** | Ensemble inválido: `NaN` de Poisson → objetivo `NaN` → pesos = punto inicial (0,2); métricas del ensemble `NaN` | `train_motor_a.py:342-355, 471-500`; verificado LL(val)=NaN y NM=0,2 con 27.999 evaluaciones |
| H1 | Alta | Walk-forward sin corte por fecha: 34.261 filas de train futuras; 782/870 filas de test 2024/2025 (9,6/10,9 %) | `train_motor_a.py:366`; tabla §3.1; ΔLL val = 9,4e-5 |
| H2 | Alta | Artefactos anteriores al rebuild v1.1: 94 `match_id` de `pred_hgb` ya no existen en `matches.parquet` (alias Extremadura/Las Palmas/Lommel); métricas publicadas sobre 181.268 filas | mtimes 08:06 vs 08:48/08:53; `pred_hgb` vs matches |
| H3 | Alta | 6 ligas (31.473 partidos, 17,3 %) sin cuota de apertura → 100 % fallback; comparaciones sesgadas por liga | `features_market.parquet`; §4.2; `pred_ensemble_b` 31.667/147.942 fallback |
| H4 | Alta | Motor B no reproducible: `NameError 'chosen'`, sin `config.json`, código editado después | `logs/EXP08_motorB_open2.log`; `artifacts/EXP08_motor_b_open2_*/` |
| H5 | Alta | Bug de índice en Poisson: defensa del local indexada con máscara del visitante | `train_motor_a.py:244` (`hi_i[known_a]`) |
| H6 | Alta | Cobertura dev 81,5 % no advertida; ensemble dev contaminado por pesos de val | §3.2, §5.4; `report.py:607-613` |
| M1 | Media | Priors "S-1" sólo en 88,5 %; 11,5 % con temporada ≥2 atrás, máx. 26; `NaN` en cambios de división | §1; `build_features.py:165-178` |
| M2 | Media | `residual_logit` implementa producto de probabilidades, no residual aditivo | `train_motor_b.py:220` vs docstring |
| M3 | Media | `fallback_motor_a` no se persiste | `train_motor_b.py:99-104, 193-229` |
| M4 | Media | Permutación i.i.d. ignora bloques temporada×división | `compare.py:194-228` |
| M5 | Media | `ensemble_b`/ensemble de A: val in-sample y dev contaminado | §3.2, §4.4 |
| M6 | Media | Informe devval con B=200/1.000 permutaciones (contrato 2.000/10.000) | `eval_devval/metrics.json` config |
| M7 | Media | Benchmarks de cierre exportados como modelos "ok" en `predictions.csv` | `export_predictions.py:32-38, 78-95` |
| M8 | Media | Fuente de mercado cambia por época/liga (B365 2002–2011, Pinnacle 2012+); supuesto de apertura sin timestamp | §4.1, §4.3 |
| M9 | Media | HGB usa `div` como categoría numérica; división no vista → −1 | `train_motor_a.py:277-283` |
| L1 | Baja | `season_progress` erróneo en JPN 2026/27 (liga de año natural con etiqueta `2026/27`): 0,10–0,34 vs 0,60–0,84 | 130 partidos live; §1 |
| L2 | Baja | `ARG` 2016 y 2016/17 comparten `season_start` (dev; sin impacto de partición) | §1 |
| L3 | Baja | `--phase close` permitido por CLI (escenario no operable) | `train_motor_b.py:111` |
| L4 | Baja | `days_rest` hasta 8.477 días (A05) sin clip; `weights` de Motor B sólo guarda el primer fold | `train_motor_b.py:191-192` |

**Aciertos verificados (no todo es negativo):** priors sin fuga (100 % cuádruple), viaje en el tiempo 0/198, métricas idénticas a sklearn, bootstrap por bloques correcto, alineación por `match_id` correcta, temperatura val→test correcta, `FEATURES` sin columnas post-partido, apertura ≠ cierre, fallback numéricamente correcto.

---

## 8. ¿Apto para producir las cifras finales de test?

**No apto.** Antes de congelar y ejecutar test una sola vez:

1. **Bloquear el test de verdad** (C1): que `--no-test` no calcule ni escriba `test`; que `eval/report.py` exija un flag explícito `--allow-test`; borrar/aislar los `metrics.json` y `predictions.csv` con test ya materializados; el test se ejecuta una vez con artefactos congelados.
2. **Arreglar Poisson y el ensemble** (C2, H5): fallback a climatología de liga cuando `div not in models`; corregir `hi_i[known_a]`; assert de no-`NaN` en `predict_proba`; guarda de `NaN` en `ensemble_weights`; recalcular pesos y verificar que no son el punto inicial. Alternativa: usar `pipeline/make_ensemble.py` (walk-forward) y excluir Poisson si no está limpio.
3. **Corte por fecha en el walk-forward** (H1): usar `eval/splits.walk_forward_splits(date_cut=True)` o filtrar `match_date < min(fecha del fold)` en `run_walk_forward` y en `train_motor_b`.
4. **Regenerar todo con datos v1.1** (H2): los artefactos actuales no cubren 94 `match_id` y se calcularon sobre 181.268 filas; reejecutar Motor A/B, export y evaluación desde `matches.parquet` 182.414. Commitear el laboratorio (hoy está untracked: `git status` → `?? research/prediction-lab/`) para poder fijar commit en los artefactos.
5. **Motor B**: reportar métricas sólo sobre el subconjunto con mercado (o mostrar el fallback por separado), persistir `fallback_motor_a`, documentar la mezcla de fuentes y el supuesto de apertura, y arreglar la reproducibilidad (config + código versionado).
6. **Evaluador**: advertir cobertura < 90 % por partición, usar B=2.000/10.000, separar benchmarks de cierre de los candidatos y permutar por bloques.

Con 1–3 corregidos y 4 reejecutado, el laboratorio sí tendría una base defendible para el cierre único de test. La parte de features y métricas ya está en estado publicable.
