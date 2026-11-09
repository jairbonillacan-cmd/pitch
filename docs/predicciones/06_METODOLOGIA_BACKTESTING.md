# 06 — Metodología de backtesting y evaluación

**Documento:** consolidación de A08 (laboratorio de evaluación) + las decisiones aprobadas por el orquestador.
**Fecha:** 2026-11-09 · **Autor:** SUBAGENTE 11 — DOCUMENTATION & REPRODUCIBILITY.
**Fuentes:** [`A08_backtesting_framework.md`](../../research/prediction-lab/reports/A08_backtesting_framework.md) · [`CONTRACT_PREDICTIONS.md`](../../research/prediction-lab/coordination/CONTRACT_PREDICTIONS.md) · [`CONTRACT_DATASET.md`](../../research/prediction-lab/coordination/CONTRACT_DATASET.md).
**Código:** `research/prediction-lab/eval/{metrics,splits,compare,report}.py` · **Tests:** 83/83 OK (verificado de nuevo el 2026-11-09, 10,5 s).

> Regla que gobierna todo el documento: **el contrato es la única fuente de verdad** y donde es ambiguo se toma una decisión explícita, documentada y testeada. El paquete no entrena nada ni conoce features: solo consume probabilidades y etiquetas, así dos modelos solo pueden diferir por sus predicciones.

---

## 1. Principios

1. **Contrato como verdad.** Cada fórmula, recorte y partición proviene de `CONTRACT_PREDICTIONS.md` §2–4 y del esquema de `CONTRACT_DATASET.md`.
2. **Independencia de modelado.** `eval/` no importa `features/` ni `models/`.
3. **Reproducibilidad.** Semillas fijas, hashes SHA-256 de las entradas, versión de Python y librerías, commit de git y parámetros en `metrics.json`; el Markdown se deriva del JSON.
4. **Fallar ruidosamente.** Toda entrada inválida (forma, NaN, filas que no suman 1, duplicados, metadatos inconsistentes) lanza `ValueError` con diagnóstico; **nunca se corrige en silencio**.
5. **Índices, no copias.** `splits.py` devuelve índices posicionales `int64` y fechas; no duplica el DataFrame.
6. **Nada de split aleatorio.** Todos los cortes son temporales y `test` queda fuera de cualquier decisión de selección.

---

## 2. Particiones canónicas

| Partición | Temporadas | Uso | n (artefacto auditado, 181.268) | n (canónico v1.1, 182.410) |
|---|---|---|---:|---:|
| `dev` | ≤ 2022/23 | entrenamiento, features, selección interna | 153.592 (84,73 %) | **154.734** |
| `val` | 2023/24 | elección de candidato e hiperparámetros | 8.152 (4,50 %) | 8.152 |
| `test` | 2024/25 + 2025/26 | evaluación final, **una sola vez** | 16.126 (8,90 %) | 16.126 |
| `live` | 2026/27 (+ `2026`) | monitorización; **nunca test** | 3.398 (1,87 %) | 3.398 |

- **`season_start` es la clave temporal canónica, no la cadena `season`.** Hay 15 años con dos etiquetas simultáneas (`2023` y `2023/24`); ordenar por la cadena rompe la secuencia.
- `2026/27` está en curso (1.868 filas, 24–42 % de una temporada completa) y `2026` (ARG/BRA/SWE/USA, ligas de año natural, 1.530 filas) también: solo monitorización.
- **Nunca split aleatorio; nunca usar `test` para elegir nada.** Cualquier métrica de `test` mostrada antes del cierre es exploratoria.
- El recuento v1.1 sale de `season_start` sobre el `matches.parquet` actual ([`12_REPRODUCIBILIDAD.md`](12_REPRODUCIBILIDAD.md) §5): el +1.142 de G1 entra íntegro en `dev`.

---

## 3. Métricas (definiciones exactas)

Sea `p_i = (p_iH, p_iD, p_iA)`, `y_i` la clase observada (`y = 0 H`, `1 D`, `2 A`) y `N` partidos.

### 3.1 Log-loss multiclase (logaritmo natural)

```
LL = -(1/N) · Σ_i ln p_i[y_i]
```

**Orden del recorte — decisión §9.1.** Si se recorta y *después* se renormaliza, una predicción one-hot perfecta deja de dar 0 (da ≈2e-15). Se aplica:

1. renormalización por fila `p_i / Σ_k p_ik` (no-op salvo 1 ulp para entradas válidas);
2. suelo inferior `1e-15` sobre la matriz normalizada;
3. **no** se vuelve a normalizar (el suelo altera la suma ≤3e-15 ≪ tolerancia 1e-6).

Consecuencia: `p = (1,0,0)` con `y = H` da `LL = 0` exacto; una probabilidad 0 para la clase observada se penaliza con `−ln(1e-15) ≈ 34,54`. **Las métricas acotadas (Brier, RPS, accuracy, balanced accuracy, calibración) usan la matriz normalizada sin suelo** — aplicado al Brier convertiría el caso perfecto en `2e-30` en vez de `0`. La separación está cubierta por tests.

### 3.2 Brier multiclase (suma)

```
BS    = (1/N) · Σ_i Σ_k (p_ik − o_ik)²          ∈ [0, 2]
BS_k  = (1/N) · Σ_i (p_ik − o_ik)²              (Brier por clase)
Σ_k BS_k = BS
```

Para `p = (1/3,1/3,1/3)`: la clase correcta aporta `4/9` y cada incorrecta `1/9` → total `6/9 = 2/3`. Es el valor que se usa como test y se reprodujo sobre datos reales (**0,66667**).

### 3.3 RPS (Ranked Probability Score), orden H < D < A

```
RPS = (1/N) · Σ_i [ 1/(K−1) · Σ_{k=1}^{K−1} (CDF_p,i(k) − CDF_o,i(k))² ] ,  K = 3
```

Ejemplo documentado en `test_rps_calculado_a_mano`: fila 1 `y=H`, `p=(0.6,0.3,0.1)` → CDF `(0.6,0.9)` vs `(1,1)`, suma de cuadrados `0.17`, entre `K−1=2` → **0.085**; fila 2 `y=D`, `p=(0.2,0.5,0.3)` → `0.13` → **0.065**; media **0.075**. Para `p` uniforme y `y=H`: `(4/9 + 1/9)/2 = 5/18 ≈ 0.2778`. Rango `[0,1]`.

### 3.4 Clasificación y calibración

- `accuracy = (1/N) Σ 1[argmax p_i = y_i]`; desempate de `argmax`: gana la primera columna (H), documentado y determinista.
- `balanced_accuracy` = media del recall de las clases **con soporte > 0** (una clase ausente no tiene recall definido; se excluye en vez de inventar un 0).
- `confusion_matrix` 3×3 (filas = verdad, columnas = predicción), con normalización opcional `true`/`pred`/`all`.
- `per_class_report`: precisión, recall, F1, soporte y nº de predicciones; medias macro y ponderada. Clases sin predicciones ni soporte reportan 0.0 (JSON estricto, sin NaN).
- **ECE:** bins de igual anchura en `[0,1]` sobre la confianza `max_k p_ik`; `ECE = Σ_b (n_b/N)·|acc_b − conf_b|`.
- **`ovr_calibration`:** por clase `k` se binariza `{y_i=k}` y se calcula el ECE con pesos `n_b/N`.
- **Limitación asumida:** el ECE depende del binning y del tamaño muestral; se publica **siempre junto a la curva** de fiabilidad y nunca como medida única. Un predictor constante tiene ECE = 0 en `dev` por construcción (un solo bin) aunque no esté calibrado.

---

## 4. Comparaciones pareadas e inferencia

Para dos sistemas `a`, `b` y una pérdida por partido `L`:

```
d_i = L_a,i − L_b,i          Δ = mean_i d_i        (Δ > 0 ⇒ a es peor)
```

### 4.1 Bootstrap pareado por bloques

- **Bloques = temporada × división** (no i.i.d. por partido).
- `B = 2000` con semilla fija; se remuestrean los `G` bloques con reemplazo mediante **multiplicidades multinomiales** y se recalcula `Δ*` como media ponderada por partido.
- IC95 % = percentiles 2,5–97,5 de `Δ*`. `frac_gt0` = fracción de remuestras con `Δ* > 0` — **no es un p-valor**.
- Con pocos bloques el IC es demasiado estrecho: `n_blocks` se reporta junto al IC.

### 4.2 Test de permutación pareado

Se permutan los signos de los `d_i`; estadístico `mean(d)`; p-valor bilateral `(1 + #{|Δ*| ≥ |Δ|}) / (n + 1)` (convención conservadora que evita `p=0`). Con sistemas idénticos, `d_i = 0` y `p = 1` exacto.

### 4.3 Alineación y regla de significancia

- **`same_matches`** exige `match_id` presente, único y no nulo. Con `strict=True` (por defecto) exige **conjuntos idénticos**; con `strict=False` usa la intersección y reporta `n_only_a`/`n_only_b`. El informe compara siempre sobre la intersección exacta.
- **Regla de veredicto (aprobada):** se declara superioridad solo si el **IC95 % de `Δlog-loss` excluye 0 _y_ `p` de permutación < 0,05**. No se usa «el IC de cada modelo por separado».
- **Sin corrección por comparaciones múltiples en fase 1**; si se comparan >2 sistemas, Holm o Benjamini-Hochberg.

---

## 5. Walk-forward

| Modo | Folds | n_train mín–máx | n_test mín–máx | Filas descartadas por fecha | Fugas |
|---|---:|---:|---:|---:|---:|
| expanding | 23 | 5.390 – 150.750 | 5.390 – 8.169 | 26.144 (total) | **0** |
| rolling(5) | 23 | 5.390 – 37.160 | 5.390 – 8.169 | 26.144 (total) | **0** |

- Folds `wf_2001` … `wf_2023`; el primero posible es la segunda temporada disponible (la primera no tiene historia). `test` y `live` están **prohibidos** como objetivo de walk-forward (`ValueError`).
- **Corte temporal anti-aplazamientos:** además de «temporadas anteriores», el train se filtra a `match_date < min(match_date del test)`. Los partidos de una temporada previa jugados más tarde se descartan y se cuantifican en `n_train_dropped_date`.
- Sobre datos reales: `check_no_leakage = []` y 2.842 filas descartadas en `wf_2023` (el 1,9 % de su train), todas de temporadas europeas 2022/23 posteriores al 27-01-2023, fecha en que arrancan las ligas de año natural. Es conservador y no introduce fuga.
- **Coste asumido:** se pierden partidos europeos de enero–mayo cuando el fold arranca con ligas de año natural. Si se adoptan modelos por división, conviene un walk-forward por `(temporada, división)`.

---

## 6. Las 83 pruebas del laboratorio

**Comando:**

```bash
./.venv/bin/python -m unittest discover -s research/prediction-lab/eval/tests -p "test_*.py" -v
# Ran 83 tests in 4.798s  ->  OK        (A08)
# Ran 83 tests in 10.485s ->  OK        (A11, reejecutado 2026-11-09)
```

| Suite | Tests | Qué cubre |
|---|---:|---|
| `test_metrics.py` | 32 | log-loss perfecto = 0 y uniforme = ln 3; Brier perfecto = 0 y uniforme = 2/3; RPS a mano (0,075) y uniforme (5/18); contraste con sklearn (log-loss, Brier OvR, per-class, accuracy, balanced, confusión) sobre 200 predicciones aleatorias con semilla fija y tolerancia 1e-9; validación de forma/NaN/sumas/rango; calibración OvR perfectamente calibrada; ECE vs tabla; `summary_metrics` |
| `test_splits.py` | 14 | máscaras canónicas exclusivas y alineadas; parseo de temporadas; expanding y rolling (últimas 5); `min_train_seasons`; `test`/`live` fuera; corte por fechas de aplazados (con y sin `date_cut`) y `check_no_leakage`; DataFrame vacío; fechas devueltas |
| `test_compare.py` | 20 | sistemas idénticos → Δ = 0 e IC [0,0]; sistema mejor → Δ < 0 e IC bajo 0; estimador puntual = diferencia de medias; reproducibilidad por semilla; bloques como etiquetas o tuplas; B=1 degenerado; permutación idénticos → p = 1 exacto; diferencia grande → p < 0,01; `same_matches` estricto/no estricto, duplicados, nulos y orden distinto |
| `test_report.py` | 17 | carga/validación; cobertura real por partición; métricas del informe = motor de métricas; comparaciones y nº de bloques; JSON estricto y Markdown bien formado; `write_report`; metadatos inconsistentes; `match_id` huérfano; un solo modelo; `only_ok`; permutaciones omitidas |

**Incidencias corregidas durante el desarrollo (no quedan fallos abiertos):** (1) el suelo `1e-15` aplicado al Brier hacía que un one-hot perfecto diera `2e-30` → se separaron matriz normalizada y recortada (decisión §9.1); (2) la tabla de cobertura del Markdown declaraba 3 columnas y emitía 4 → corregido con un test de consistencia; (3) un test de splits asumía que `wf_2021` predice 2020/21 (el fold se etiqueta por año de inicio → `wf_2020`); (4) `render_markdown` concatenaba lista + tupla (`TypeError`).

> **Nota de alcance:** `unittest` (no `pytest`, que no está instalado). `scikit-learn` solo se usa como **oráculo** en los tests; el motor no depende de él.

---

## 7. Del archivo de predicciones al informe

### 7.1 Entrada

`predictions.csv` con las 12 columnas del contrato (`match_id`, `div`, `season`, `match_date`, `model_id`, `model_version`, `p_home`, `p_draw`, `p_away`, `fold_id`, `generated_at`, `data_quality_flag`) y `matches.parquet` con `match_id`, `div`, `season`, `match_date`, `result` (y `season_start` si existe).

Reglas: `p_home + p_draw + p_away = 1 ± 1e-6`; sin NaN; sin duplicados `(match_id, model_id)`; ninguna predicción con información posterior a `match_date`.

Validaciones de `report.py`: columnas obligatorias, NaN, probabilidades `(N,3)`, fechas parseables, unicidad, `match_id` único en el parquet, resultado en `{H,D,A}` y coherencia `div`/`season`/`match_date` (error salvo `--allow-metadata-mismatch`, que manda el parquet y registra la advertencia).

### 7.2 Salida

`metrics.json` (`schema_version = a08-metrics/1.0`): entorno (Python/numpy/pandas, commit y estado de git), hashes y rutas de las entradas, configuración (bins, B, permutaciones, semilla, bloques, particiones), cobertura, métricas por modelo (global, partición, temporada, división, temporada×división y fold), comparaciones pareadas y advertencias.

`metrics.md` con 9 secciones: cobertura, métricas por modelo/partición, robustez por temporada/división, comparaciones pareadas, robustez comparada, advertencias, metodología, limitaciones y **comando de reproducción**.

### 7.3 Prueba de humo sobre datos reales (no es un resultado científico)

Dos referencias ingenuas —`smoke_uniform_v0` (1/3,1/3,1/3) y `smoke_devbase_v0` (frecuencias de `dev`: 0,4528/0,2688/0,2784 constantes)— sobre los 181.268 partidos: **362.536 predicciones**, 5 comparaciones, 74,9 s, `metrics.json` 690 KB y `metrics.md` 19 KB.

| Modelo | Partición | N | Log-loss | Brier | RPS | Accuracy | ECE |
|---|---|---:|---:|---:|---:|---:|---:|
| `smoke_devbase_v0` | dev | 153.592 | 1,06789 | 0,64521 | 0,22433 | 0,4528 | 0,0000 |
| | val | 8.152 | 1,07460 | 0,65002 | 0,22666 | 0,4390 | 0,0138 |
| | test | 16.126 | 1,07515 | 0,65044 | 0,22776 | 0,4376 | 0,0152 |
| | live | 3.398 | 1,07431 | 0,64991 | 0,23024 | 0,4385 | 0,0143 |
| `smoke_uniform_v0` | dev–live | 181.268 | **1,09861** | **0,66667** | 0,2331 | 0,4506 | 0,1172 |

La uniforme reproduce `ln 3` y `2/3` **exactos**: es la validación numérica del motor contra la teoría. La comparación base-rate vs uniforme da `Δlog-loss = −0,02965` con IC95 % [−0,03116, −0,02817] y `p = 0,0005` (mínimo con 2000 permutaciones); ilustra por qué el contrato fija 10.000 permutaciones en producción (mínimo `1/10001 ≈ 0,0001`).

**Advertencia:** `eval/artifacts/smoke/` no es un modelo del laboratorio y **no debe citarse como rendimiento de PitchLab**.

---

## 8. Decisiones metodológicas aprobadas

| # | Decisión | Estado |
|---|---|---|
| 1 | Orden del recorte: renormalizar → suelo `1e-15` → no renormalizar; métricas acotadas con matriz normalizada | **APROBADA** |
| 2 | `season_start` como clave canónica de orden temporal (15 años con doble etiqueta) | **APROBADA** |
| 3 | Walk-forward solo `dev`/`val` con corte por fecha en el train (coste: 26.144 filas) | **APROBADA** |
| 4 | Significancia = IC95 % bootstrap por bloques excluye 0 **y** p-permutación < 0,05 | **APROBADA** |
| 5 | `test` = 2024/25 + 2025/26 agregadas, evaluado una sola vez al congelar candidatos | **APROBADA** |
| 6 | Bloques = temporada × división, con intersección exacta de `match_id` y recuento de exclusiones | **APROBADA** |

**Nota de integridad (`TASKS.md`):** cualquier métrica de `test` mostrada antes del cierre es exploratoria y no puede usarse para seleccionar modelo; el cierre se hará en un único run final documentado.

---

## 9. Limitaciones del marco

1. **ECE** depende del binning (10 por defecto) y del tamaño por bin; con N pequeño es sesgado y ruidoso. Se reporta con curva completa y OvR, nunca como medida única.
2. **Bootstrap por bloques** supone intercambiabilidad de bloques; con pocos bloques el IC es demasiado estrecho. El bootstrap **no es un test de hipótesis**: `frac_gt0` no es un p-valor.
3. **Permutación** asume simetría de los signos de las diferencias pareadas y **no corrige comparaciones múltiples**.
4. **Calendarios mixtos:** el corte por fecha descarta 26.144 filas en 23 folds (1,9 % del train de `wf_2023`).
5. **`test` agrupado:** la decisión debe basarse en el agregado y en la robustez, no en elegir la temporada más favorable.
6. **`live` es parcial** (3.398 partidos): monitorización, nunca selección.
7. **Conversión de probabilidades:** el motor asume que `p` ya está de-vigada y normalizada; no detecta una cuota mal convertida más allá de forma/rango/suma.
8. **Cobertura de predicciones:** si dos modelos no cubren los mismos partidos, la comparación usa la intersección; un modelo con cobertura sesgada (p. ej. solo partidos con cuotas) puede parecer mejor sin serlo.
9. **`data_quality_flag`:** por defecto se incluyen todas las filas; `--only-ok` excluye las degradadas y el informe muestra la distribución.
10. **Una fila por `(match_id, model_id)`:** un modelo que escriba walk-forward y test para el mismo partido debe separarlos en artefactos/`model_id` distintos.

---

## 10. Checklist para aceptar un modelo

Un candidato solo se acepta si cumple **todo**:

- [ ] Predicciones en `artifacts/<exp_id>/predictions.csv` con las 12 columnas del contrato y simplex válido.
- [ ] Ninguna decisión de ajuste/hiperparámetro usó `test` (verificable en `config.json` y en el log).
- [ ] Comparación contra **base-rate**, **Elo** y **mercado de-vig** sobre la **intersección exacta** de `match_id`.
- [ ] IC95 % bootstrap por bloques **y** p de permutación reportados; la mejora no depende de una temporada ni de una división.
- [ ] Log-loss, Brier, RPS **y** ECE con curva; accuracy solo como diagnóstico.
- [ ] `metrics.json` reproducible con semilla y hashes; comando escrito en `metrics.md`.
- [ ] Limitaciones declaradas (cobertura, `n`, mercados no operables) en el mismo artefacto.

**Reproducir el marco completo:** ver [`12_REPRODUCIBILIDAD.md`](12_REPRODUCIBILIDAD.md) §4.
