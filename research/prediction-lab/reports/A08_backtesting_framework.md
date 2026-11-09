# A08 — Backtesting & Statistics: laboratorio de evaluación

**Rol:** BACKTESTING & STATISTICS ENGINEER (independiente de los agentes de modelado)
**Fecha:** 2026-11-09 · **Worktree:** `/Users/jairbonilla/PitchLab-Prediction-Lab` (rama `prediction-lab`)
**Estado:** fase 1 completada · **Tests:** 83/83 OK · **Datos reales verificados:** 181.268 partidos con resultado

---

## 0. Resumen ejecutivo

Se implementó el laboratorio de evaluación en `research/prediction-lab/eval/` con cinco piezas:
`metrics.py` (métricas del contrato), `splits.py` (particiones canónicas y walk-forward),
`compare.py` (bootstrap pareado por bloques, permutación y alineación estricta por `match_id`),
`report.py` (generación reproducible de `metrics.json` + `metrics.md`) y cuatro suites de tests
con `unittest` (pytest no está instalado).

Resultados verificados:

- **83 tests, 83 OK** (`Ran 83 tests in 4.798s / OK`).
- **181.268 partidos con resultado** en `matches.parquet` (requisito: ≥50.000). Cobertura real:
  `dev` 153.592 (84,7 %), `val` 8.152 (4,5 %), `test` 16.126 (8,9 %), `live` 3.398 (1,9 %).
- **Smoke test de plomería sobre los 181.268 partidos**: 362.536 predicciones (2 referencias
  ingenuas), 5 comparaciones pareadas, 74,9 s, `metrics.json` 690 KB y `metrics.md` 19 KB.
  El log-loss de la predicción uniforme resultó **exactamente ln 3 = 1,09861** y su Brier
  **exactamente 2/3**, lo que valida numéricamente el motor contra la teoría.
- **Cero modificaciones** a `src/`, `tests/`, `etl/`, `data/` ni a `coordination/MASTER.md`/`TASKS.md`.

Decisiones metodológicas que requieren aprobación del orquestador: **§9**.

---

## 1. Alcance y principios

1. **El contrato es la única fuente de verdad.** Cada fórmula, recorte y partición proviene de
   `CONTRACT_PREDICTIONS.md` §2–4 y del esquema de `CONTRACT_DATASET.md`. Donde el contrato es
   ambiguo se tomó una decisión explícita, documentada y testeada (§3.2 y §9).
2. **Independencia de modelado.** El paquete no entrena nada ni conoce features: solo consume
   probabilidades y etiquetas. Así, dos modelos solo pueden diferir por sus predicciones.
3. **Reproducibilidad.** Semillas fijas, hashes SHA-256 de las entradas, versión de Python y
   librerías, commit de git y parámetros en `metrics.json`. El Markdown se deriva del JSON.
4. **Fallar ruidosamente.** Toda entrada inválida (forma, NaN, filas que no suman 1, duplicados,
   metadatos inconsistentes) lanza `ValueError` con diagnóstico; nunca se corrige en silencio.
5. **Índices, no copias.** `splits.py` devuelve índices posicionales `int64` y fechas; nunca
   duplica el DataFrame.
6. **Nada de split aleatorio.** Todos los cortes son temporales y `test` queda fuera de cualquier
   decisión de selección.

---

## 2. Diseño del paquete `eval/`

| Archivo | API pública | Responsabilidad |
|---|---|---|
| `__init__.py` | `__version__` | Paquete y documentación de módulos |
| `metrics.py` | `multiclass_log_loss`, `brier_multiclass`, `brier_per_class`, `rps`, `accuracy`, `balanced_accuracy`, `confusion_matrix`, `per_class_report`, `calibration_table`, `ece`, `ovr_calibration`, `summary_metrics`, `validate_probabilities`, `validate_labels`, `encode_result`, `per_sample_log_loss`, `per_sample_brier` | Métricas exactas del contrato + validación de entrada |
| `splits.py` | `canonical_masks`, `canonical_partition_series`, `walk_forward_splits`, `check_no_leakage`, `season_start_year`, `partition_for_year` | Particiones `dev/val/test/live` y folds walk-forward sin fuga |
| `compare.py` | `paired_bootstrap_delta`, `permutation_test_delta`, `compare_systems`, `same_matches`, `make_blocks` | Inferencia pareada por bloques y alineación por `match_id` |
| `report.py` | `load_predictions`, `load_matches`, `prepare_frame`, `build_report`, `write_report`, `render_markdown`, `main` | Informe `metrics.json` + `metrics.md` desde `predictions.csv` + `matches.parquet` |
| `tests/test_metrics.py` | 32 tests | Fórmulas, validación, calibración y contraste con sklearn |
| `tests/test_splits.py` | 14 tests | Máscaras, expanding/rolling, corte por fechas, ausencia de fuga |
| `tests/test_compare.py` | 20 tests | Bootstrap, permutación, bloques, `same_matches` |
| `tests/test_report.py` | 17 tests | Carga, cobertura, métricas, comparaciones, Markdown |

Dependencias de ejecución: **numpy y pandas** (más pyarrow para leer el parquet). `scikit-learn`
solo se usa en los tests como oráculo independiente; el motor no depende de él.

Flujo típico:

```
matches.parquet ──► splits.canonical_masks / walk_forward_splits ──► modelos (A06/A07)
                                                          │
predictions.csv (contrato §1) ──► report.load_predictions ─┴─► prepare_frame ──► metrics.summary_metrics
                                                                        │
                                              compare.paired_bootstrap_delta + permutation_test_delta
                                                                        │
                                                       metrics.json + metrics.md
```

---

## 3. Convenciones y fórmulas

### 3.1 Etiquetas, validación y orden

- `y = 0` (H), `1` (D), `2` (A); orden ordinal **H < D < A**, usado únicamente por el RPS.
- `p` es `(N, 3)` con columnas `(p_home, p_draw, p_away)`, sin NaN, en `[0,1]` (tolerancia 1e-12)
  y filas que suman `1 ± 1e-6`. Cualquier violación lanza `ValueError` indicando la primera fila
  problemática.
- `encode_result` es el único punto que traduce `H/D/A` del parquet a `0/1/2`; `metrics.py` no
  acepta cadenas para evitar conversiones implícitas.
- Desempate de `argmax`: gana la primera columna (H). Es determinista y está documentado; con
  probabilidades continuas el empate exacto es improbable.

### 3.2 Log-loss multiclase

```
LL = -(1/N) · Σ_i ln p_i[y_i]
```

**Orden del recorte (decisión).** El contrato pide “`p` recortada a `[1e-15, 1]` y renormalizada”.
Si se recorta y **después** se renormaliza, una predicción one-hot perfecta deja de dar 0
(da ≈2e-15 por redondeo). Para preservar las propiedades matemáticas se aplica:

1. renormalización por fila `p_i / Σ_k p_ik` (no-op salvo 1 ulp para entradas válidas);
2. suelo inferior `1e-15` sobre la matriz normalizada;
3. **no** se vuelve a normalizar (el suelo altera la suma ≤3e-15 ≪ tolerancia 1e-6).

Consecuencia: `p = (1,0,0)` con `y = H` da `LL = 0` exacto; una probabilidad 0 para la clase
observada se penaliza con `-ln(1e-15) ≈ 34,54`.

**Las métricas acotadas (Brier, RPS, accuracy, balanced accuracy y calibración) usan la matriz
normalizada sin suelo.** El suelo solo es necesario para acotar `log`; aplicado al Brier
convertiría el caso perfecto en `2e-30` en lugar de `0`. Esta separación está cubierta por tests.

### 3.3 Brier

```
BS      = (1/N) · Σ_i Σ_k (p_ik − o_ik)²          ∈ [0, 2]
BS_k    = (1/N) · Σ_i (p_ik − o_ik)²              (Brier por clase)
Σ_k BS_k = BS
```

Para `p = (1/3,1/3,1/3)` y cualquier `y`: la clase correcta aporta `(1/3−1)² = 4/9` y cada una de
las dos incorrectas `(1/3)² = 1/9`; total `6/9 = 2/3`. Es el valor que se usa como test y que se
reprodujo sobre datos reales (0,66667).

### 3.4 RPS (Ranked Probability Score)

```
RPS = (1/N) · Σ_i [ 1/(K−1) · Σ_{k=1}^{K−1} (CDF_p,i(k) − CDF_o,i(k))² ] ,  K = 3
```

Ejemplo documentado en `test_rps_calculado_a_mano`:

- Fila 1: `y=H`, `p=(0.6,0.3,0.1)` → `CDF_p=(0.6,0.9)`, `CDF_o=(1,1)`, diffs `(−0.4,−0.1)`,
  suma de cuadrados `0.17`, entre `K−1=2` → `0.085`.
- Fila 2: `y=D`, `p=(0.2,0.5,0.3)` → `CDF_p=(0.2,0.7)`, `CDF_o=(0,1)`, diffs `(0.2,−0.3)`,
  suma `0.13` → `0.065`.
- Media: `(0.085 + 0.065)/2 = 0.075`.

Para `p` uniforme y `y=H`: `(4/9 + 1/9)/2 = 5/18 ≈ 0.2778`. El rango es `[0,1]`.

### 3.5 Clasificación

- `accuracy = (1/N) Σ 1[argmax p_i = y_i]`.
- `balanced_accuracy` = media del recall de las clases **con soporte > 0**. Una clase ausente no
  tiene recall definido; se excluye en lugar de inventar un 0 que sesgaría la media (documentado y
  testeado contra sklearn cuando las 3 clases están presentes).
- `confusion_matrix` 3×3 (filas = verdad, columnas = predicción), con normalización opcional
  `true`/`pred`/`all`.
- `per_class_report`: precisión, recall, F1, soporte y nº de predicciones por clase; medias macro y
  ponderada por soporte. Clases sin predicciones ni soporte reportan 0.0 (JSON estricto, sin NaN).

### 3.6 Calibración

- Bins de igual anchura en `[0,1]` sobre la confianza `max_k p_ik` de la clase predicha.
- `ECE = Σ_b (n_b/N) · |acc_b − conf_b|`.
- `ovr_calibration`: para cada clase `k`, se binariza el evento `{y_i=k}`, se usan bins sobre
  `p_ik` y se calcula el ECE con pesos `n_b/N`.
- **Limitación asumida:** ECE depende del binning y del tamaño muestral; se publica siempre junto
  a la curva de fiabilidad y nunca como medida única. Ejemplo real: un predictor constante
  (probabilidades fijas) tiene ECE = 0 en `dev` por construcción —hay un solo bin—, aunque no esté
  bien calibrado para partidos individuales. Esto justifica la curva y el OvR.

### 3.7 Comparaciones pareadas

Para dos sistemas `a`, `b` y una pérdida por partido `L`:

```
d_i = L_a,i − L_b,i          Δ = mean_i d_i        (Δ > 0 ⇒ a es peor)
```

- **Bootstrap por bloques** (`B=2000`, semilla fija): bloques = **temporada × división**. Se
  remuestrean los `G` bloques con reemplazo mediante multiplicidades multinomiales y se recalcula
  `Δ*` como media ponderada por partido. IC95 % = percentiles 2,5–97,5 de `Δ*`. `frac_gt0` es la
  fracción de remuestras con `Δ* > 0` (no es un p-valor).
- **Test de permutación pareado**: se permutan los signos de los `d_i`; estadístico `mean(d)`.
  p-valor bilateral `(1 + #{|Δ*| ≥ |Δ|}) / (n + 1)` (convención conservadora que evita `p=0`).
  Con sistemas idénticos, `d_i = 0` y `p = 1` exacto.
- **`same_matches`**: exige `match_id` presente, único y no nulo. Con `strict=True` (por defecto)
  exige **conjuntos idénticos** y lanza error si difieren; con `strict=False` usa la intersección
  y reporta `n_only_a`/`n_only_b`. El informe compara siempre sobre la intersección exacta.
- **Regla de veredicto:** se declara superioridad solo si el IC95 % de `Δlog-loss` excluye 0 **y**
  `p < 0,05`. No se usa “el IC de cada modelo por separado”.

### 3.8 Particiones y walk-forward

| Partición | Temporadas canónicas | Uso |
|---|---|---|
| `dev` | ≤ 2022/23 | entrenamiento, features, selección interna |
| `val` | 2023/24 | elección de candidato/hiperparámetros |
| `test` | 2024/25 y 2025/26 | evaluación final, una sola vez |
| `live` | 2026/27 | monitorización; nunca test |

`walk_forward_splits(df, mode="expanding"|"rolling", rolling_seasons=5)` recorre las temporadas de
`dev` ∪ `val` y devuelve folds con `train_idx`/`test_idx` posicionales, fechas y metadatos. El
primer fold posible es la segunda temporada disponible (la primera no tiene historia). `test` y
`live` están **prohibidos** como objetivo de walk-forward (`ValueError`).

**Corte temporal anti-aplazamientos.** Además de “temporadas anteriores”, el entrenamiento se
filtra a `match_date < min(match_date del test)`. Los partidos de una temporada previa jugados más
tarde (aplazamientos, o temporadas de calendario natural que arrancan en enero) se descartan del
train y se cuantifican en `n_train_dropped_date`. Sobre datos reales: 23 folds (`wf_2001` …
`wf_2023`), `check_no_leakage = []`, y 26.144 filas descartadas en total (2.842 en `wf_2023`,
el 1,9 % de su train), todas de temporadas europeas 2022/23 posteriores al 27-01-2023, fecha en que
arrancan las ligas de año natural. Es conservador y no introduce fuga.

---

## 4. `report.py`: contrato de entrada y salida

**Entrada:** `predictions.csv` con las 12 columnas del contrato §1 y `matches.parquet` con
`match_id`, `div`, `season`, `match_date`, `result` (y `season_start` si existe).

Validaciones: columnas obligatorias, NaN, probabilidades `(N,3)`, fechas parseables, unicidad
`(match_id, model_id)`, `match_id` único en el parquet, resultado en `{H,D,A}`, y coherencia de
`div`/`season`/`match_date` entre predicción y parquet (error salvo
`--allow-metadata-mismatch`, en cuyo caso manda el parquet y se registra la advertencia).

**Salida** en `--out-dir`:

- `metrics.json` (`schema_version = a08-metrics/1.0`) con: entorno (Python/numpy/pandas, commit y
  estado de git), hashes y rutas de las entradas, configuración (bins, B, permutaciones, semilla,
  bloques, particiones), cobertura, métricas por modelo (global, partición, temporada, división,
  temporada×división y fold), comparaciones pareadas y advertencias.
- `metrics.md` con 9 secciones: cobertura, métricas por modelo/partición, robustez por
  temporada/división, comparaciones pareadas, robustez comparada, advertencias, metodología,
  limitaciones y comando de reproducción.

**Cobertura:** se cuentan los partidos del parquet por partición y las predicciones emparejadas por
modelo; las predicciones con `match_id` ausente se contabilizan como `unmatched_rows` y se
excluyen, nunca se inventan etiquetas.

Uso:

```bash
./.venv/bin/python research/prediction-lab/eval/report.py \
  --predictions research/prediction-lab/artifacts/<exp_id>/predictions.csv \
  --matches research/prediction-lab/data/processed/matches.parquet \
  --out-dir research/prediction-lab/artifacts/<exp_id> \
  --bins 10 --bootstrap-B 2000 --permutations 10000 --seed 20261109
```

---

## 5. Tests ejecutados (83/83 OK)

Comando exacto y salida:

```bash
$ ./.venv/bin/python -m unittest discover -s research/prediction-lab/eval/tests -p "test_*.py" -v
...
----------------------------------------------------------------------
Ran 83 tests in 4.798s

OK
```

| Suite | Tests | Cobertura de casos |
|---|---|---|
| `test_metrics.py` | 32 | log-loss perfecto = 0 y uniforme = ln 3; Brier perfecto = 0 y uniforme = 2/3; RPS a mano (0,075) y uniforme (5/18); contraste con sklearn (log-loss, Brier OvR, per-class, accuracy, balanced, confusión) sobre 200 predicciones aleatorias con semilla fija y tolerancia 1e-9; validación de forma/NaN/sumas/rango; calibración OvR perfectamente calibrada; ECE vs tabla; `per_class`; `summary_metrics` |
| `test_splits.py` | 14 | máscaras canónicas exclusivas y alineadas; parseo de temporadas; expanding (todo lo anterior) y rolling (últimas 5); `min_train_seasons`; `test`/`live` fuera; corte por fechas de aplazados (con y sin `date_cut`) y `check_no_leakage`; DataFrame vacío; fechas devueltas |
| `test_compare.py` | 20 | sistemas idénticos → Δ = 0 e IC [0,0]; sistema mejor → Δ < 0 e IC bajo 0; estimador puntual = diferencia de medias; reproducibilidad por semilla; bloques como etiquetas o tuplas; B=1 degenerado; `permutation` idénticos → p = 1 exacto; diferencia grande → p < 0,01; `same_matches` estricto/no estricto, duplicados, nulos y orden distinto |
| `test_report.py` | 17 | carga/validación; cobertura real por partición; métricas del informe = motor de métricas; comparaciones y nº de bloques; JSON estricto y Markdown bien formado; `write_report`; metadatos inconsistentes; `match_id` huérfano; un solo modelo; `only_ok`; permutaciones omitidas |

**Incidencias encontradas y corregidas durante el desarrollo** (no quedan fallos abiertos):

1. El suelo `1e-15` aplicado al Brier hacía que una predicción one-hot perfecta diera `2e-30` en
   lugar de 0. Se separó la matriz normalizada (métricas acotadas) de la recortada (log-loss).
   Es la decisión §9.1.
2. La tabla de cobertura del Markdown declaraba 3 columnas y emitía 4. Se corrigió y se añadió un
   test que verifica que todos los bloques de tabla tengan el mismo número de celdas.
3. Un test de splits asumía que `wf_2021` predice la temporada 2020/21; el fold se etiqueta por
   año de inicio (`wf_2020`). Era un error del test, no del código.
4. `render_markdown` concatenaba lista + tupla (`TypeError`) en la iteración de particiones. Corregido.

---

## 6. Cobertura real de `matches.parquet` (verificación con datos reales)

Archivo: `research/prediction-lab/data/processed/matches.parquet`
SHA-256: `da31b8306bfee4eddbde8f47bd48c52754b9565c751cb7dbb90272e184056cc6` (6,8 MB)
Filas totales: **181.272** · Con resultado `H/D/A`: **181.268** · Sin resultado: **4** (excluidos).

| Partición | Partidos | % del total | Divisiones | Etiquetas de temporada incluidas |
|---|---:|---:|---:|---|
| `dev` | 153.592 | 84,73 % | 23 | `2000/01`–`2022/23` + año natural `2012`–`2022` |
| `val` | 8.152 | 4,50 % | 23 | `2023/24` + `2023` |
| `test` | 16.126 | 8,90 % | 23 | `2024/25`, `2025/26` + `2024`, `2025` |
| `live` | 3.398 | 1,87 % | 23 | `2026/27` + `2026` |
| **Total** | **181.268** | **100 %** | 23 | 42 etiquetas |

- Rango de fechas: **2000-07-28 → 2026-11-06**. 23 divisiones (17 principales + `ARG`, `BRA`,
  `JPN`, `SWE`, `USA`, `MEX`). 42 etiquetas de temporada: 12 europeas puras, 15 de año natural y 15
  europeas con año natural en paralelo (`2012/13`…`2026/27`).
- `season_start` coincide con el año de la etiqueta `season` en el 100 % de las filas y es la clave
  robusta para ordenar temporadas. **No usar la cadena `season` para ordenar**: hay 15 años con dos
  etiquetas simultáneas (p. ej. `2023` y `2023/24`).

**Observaciones de calidad para A04 (no corregidas por A08, que no puede tocar `data/`):**

1. `match_date` está almacenada como `object`/texto, no como tipo fecha. Los loaders la parsean con
   `pd.to_datetime` y fallan si hay NaN; aun así, el contrato pide tipo `date`.
2. 4 filas sin `result`: se excluyen del universo evaluable y se reportan (181.272 → 181.268).
3. Convivencia de calendarios: las ligas de año natural (`ARG`, `BRA`, `JPN`, `SWE`, `USA` y parte
   de `MEX`) usan etiqueta `YYYY` y `season_start = YYYY`; las europeas usan `YYYY/YY`. Esto obliga
   al corte por fecha del walk-forward (§3.8) y a no agrupar por la etiqueta `season`.

**Walk-forward real** (23 folds, `wf_2001`…`wf_2023`, expanding y rolling-5):

| Modo | Folds | n_train mín–máx | n_test mín–máx | Filas descartadas por fecha | Fugas |
|---|---:|---:|---:|---:|---|
| expanding | 23 | 5.390 – 150.750 | 5.390 – 8.169 | 26.144 (total) | 0 |
| rolling(5) | 23 | 5.390 – 37.160 | 5.390 – 8.169 | 26.144 (total) | 0 |

---

## 7. Evidencia de ejecución sobre datos reales (smoke test)

**Qué es y qué no es.** Para validar la plomería completa (carga → métricas → comparaciones →
JSON/Markdown) se generaron dos **referencias ingenuas** sobre los 181.268 partidos, no modelos del
laboratorio: `smoke_uniform_v0` (1/3, 1/3, 1/3) y `smoke_devbase_v0` (frecuencias H/D/A de `dev`:
0,4528 / 0,2688 / 0,2784, constantes). El archivo está en
`eval/artifacts/smoke/predictions.csv` (362.536 filas, SHA-256 `b725bddd002fdc5b…`). **No es un
resultado científico ni debe citarse como rendimiento de PitchLab.**

Comando (tiempo real 74,9 s en esta máquina):

```bash
./.venv/bin/python research/prediction-lab/eval/report.py \
  --predictions research/prediction-lab/eval/artifacts/smoke/predictions.csv \
  --matches research/prediction-lab/data/processed/matches.parquet \
  --out-dir research/prediction-lab/eval/artifacts/smoke \
  --bins 10 --bootstrap-B 2000 --permutations 2000 --seed 20261109
```

| Modelo | Partición | N | Log-loss | Brier | RPS | Accuracy | ECE |
|---|---|---:|---:|---:|---:|---:|---:|
| `smoke_devbase_v0` | dev | 153.592 | 1,06789 | 0,64521 | 0,22433 | 0,4528 | 0,0000 |
| | val | 8.152 | 1,07460 | 0,65002 | 0,22666 | 0,4390 | 0,0138 |
| | test | 16.126 | 1,07515 | 0,65044 | 0,22776 | 0,4376 | 0,0152 |
| | live | 3.398 | 1,07431 | 0,64991 | 0,23024 | 0,4385 | 0,0143 |
| `smoke_uniform_v0` | dev–live | 181.268 | 1,09861 | 0,66667 | 0,2331 | 0,4506 | 0,1172 |

La uniforme reproduce `ln 3` y `2/3` exactos. La comparación base-rate vs uniforme da
`Δlog-loss = −0,02965` con IC95 % `[−0,03116, −0,02817]`, `frac Δ>0 = 0`, `p = 0,0005`
(mínimo posible con 2000 permutaciones) y veredicto “significativo”: la referencia de base rates es
mejor, como era de esperar. El `p = 0,0005` ilustra por qué el contrato fija 10.000 permutaciones
en producción (mínimo `1/10001 ≈ 0,0001`).

Artefactos: `metrics.json` (690 KB) y `metrics.md` (19 KB). El JSON incluye hashes de las dos
entradas, config, cobertura por partición, métricas por temporada/división y las 5 comparaciones
(global + 4 particiones) con IC95 %, fracciones, p-valor y veredicto.

---

## 8. Limitaciones

1. **ECE** depende del binning (10 bins por defecto) y del tamaño por bin; con N pequeño es sesgado
   y ruidoso. Se reporta con la curva completa y OvR, nunca como medida única.
2. **Bootstrap por bloques** supone intercambiabilidad de bloques. Con pocos bloques (p. ej. una
   sola temporada×división) el IC es demasiado estrecho; por eso `n_blocks` se reporta junto al IC.
   El bootstrap no es un test de hipótesis: la fracción `Δ>0` no es un p-valor.
3. **Test de permutación** asume simetría de los signos de las diferencias pareadas; además no
   corrige comparaciones múltiples (varios modelos y particiones). En fase 2 se propone Holm o
   Benjamini-Hochberg si el orquestador compara >2 sistemas.
4. **Calendarios mixtos:** el corte por fecha del walk-forward descarta 26.144 filas en total
   (1,9 % del train de `wf_2023`). Es conservador: evita fuga, pero pierde partidos europeos de
   enero–mayo cuando el fold arranca con ligas de año natural. Si A06/A07 adoptan modelos por
   división, conviene un walk-forward por `(temporada, división)`.
5. **`test` agrupado:** el contrato define `test` = 2024/25 + 2025/26 juntas. El informe da el
   desglose por temporada, pero la decisión de adoptar un modelo debe basarse en el agregado y en
   la robustez, no en elegir la temporada más favorable.
6. **`live` es parcial** (3.398 partidos, 2026/27 en curso): sirve para monitorización, nunca para
   seleccionar.
7. **Conversión de probabilidades:** el motor asume que `p` ya está de-vigada y normalizada; no
   detecta una cuota mal convertida más allá de las validaciones de forma/rango/suma.
8. **Cobertura de predicciones:** si dos modelos no cubren los mismos partidos, la comparación usa
   la intersección y reporta los descartes; un modelo con cobertura sesgada (p. ej. solo partidos
   con cuotas) puede parecer mejor sin serlo.
9. **`data_quality_flag`:** por defecto se incluyen todas las filas; `--only-ok` permite excluir
   las degradadas. El informe muestra la distribución para que la decisión sea explícita.
10. **Una fila por (match_id, model_id):** el contrato lo exige y el loader lo impone. Un modelo que
    escriba predicciones de walk-forward y de test para el mismo partido debe separarlas en
    artefactos/`model_id` distintos.
11. **Smoke test:** las referencias ingenuas de §7 no son modelos validados; solo prueban la
    infraestructura.

---

## 9. Decisiones metodológicas que el orquestador debe aprobar

1. **Orden del recorte:** renormalizar → suelo `1e-15` → no renormalizar; métricas acotadas con la
   matriz normalizada sin suelo. Garantiza log-loss 0 en predicción perfecta y Brier 0 en one-hot.
   (Alternativa literal del contrato: recortar y renormalizar; daría `LL ≈ 2e-15` en el caso perfecto.)
2. **`season_start` como clave canónica de orden temporal**, no la cadena `season`, por los 15 años
   con doble etiqueta. Las particiones y folds se definen por `season_start`.
3. **Walk-forward solo para `dev`/`val`** y **corte por fecha** en el train (descarta aplazados y
   temporadas de calendario natural que empiezan antes). Coste: 26.144 filas en 23 folds.
4. **Regla de significancia:** IC95 % bootstrap por bloques excluye 0 **y** p-permutación < 0,05.
   Sin corrección por comparaciones múltiples en fase 1.
5. **`test` = 2024/25 + 2025/26 agregadas** (con desglose por temporada), evaluado una sola vez.
6. **Bloques de comparación = temporada × división**, con la intersección exacta de `match_id` y
   recuento explícito de exclusiones.

---

## 10. Integración para A06/A07

1. Escribir `artifacts/<exp_id>/predictions.csv` con las 12 columnas del contrato; una fila por
   `(match_id, model_id)`; `p_*` normalizadas; `fold_id` coherente (`wf_2023`, `test_2024`, …).
2. No generar predicciones de `test` hasta congelar el candidato; no reutilizar `test` para
   hiperparámetros.
3. Ejecutar `eval/report.py` con `--out-dir artifacts/<exp_id>` (mismo directorio del experimento).
   El comando de reproducción queda escrito en `metrics.md`.
4. Leer `metrics.json` para el veredicto: `models.<id>.by_partition.test` y `comparisons` con
   `significant_95`/`better_model`. No comparar IC de modelos por separado.
5. Si el modelo usa walk-forward, `splits.walk_forward_splits` ya devuelve los índices y aplica el
   corte anti-fuga; no reimplementar el corte por temporada.

---

## 11. Reproducibilidad

- Entorno: Python 3.9.6, numpy 2.0.2, pandas 2.2.3, scipy 1.13.1, scikit-learn 1.6.1 (solo tests),
  pyarrow 17.0.0.
- Commit del worktree: `8424876` (dirty, porque el laboratorio aún no está commiteado).
- `matches.parquet`: SHA-256 `da31b8306bfee4eddbde8f47bd48c52754b9565c751cb7dbb90272e184056cc6`.
- Smoke `predictions.csv`: SHA-256 `b725bddd002fdc5b8b1363eff8cd0efd4065768cf2bcf63d169ae8c560ecdb12`.
- Tests: `./.venv/bin/python -m unittest discover -s research/prediction-lab/eval/tests -p "test_*.py" -v`.
- Informe: comando de §7 (semilla 20261109; B=2000; 2000 permutaciones para el smoke; el valor por
  defecto del CLI y del contrato es 10.000).
