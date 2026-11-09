# A06 — Motor A: experimentos de modelado

**Agente:** MODEL RESEARCHER MOTOR A (SUBAGENTE 06)
**Fecha:** 2026-11-09 · **Worktree:** `/Users/jairbonilla/PitchLab-Prediction-Lab`
**Lab:** `research/prediction-lab/` · **Semilla global:** 20261109
**Datos:** `data/processed/features.parquet` **v1.1** (182.410 partidos × 198 columnas, causales;
priors de equipo corregidos: ya no usan la temporada siguiente; +1.142 partidos G1 recuperados)
**Particiones:** dev ≤ 2022/23 · val = 2023/24 (única para elegir) · **test (2024/25, 2025/26) NO usado**
**Modelo sin cuotas:** todas las features son deportivas; el mercado solo aparece como benchmark.

Todos los números de este informe salen de los scripts de `models/a/experiments/` ejecutados en
esta sesión. Los logs crudos están en `logs/exp02_full.log`, `logs/exp03.log`,
`logs/exp06.log` y `logs/exp10.log`.

---

## 0. Resumen ejecutivo

| Sistema (sin cuotas) | val 2023/24 log-loss | Brier | RPS | Δ vs hgb |
|---|---:|---:|---:|---:|
| Mercado Pinnacle cierre *power* (referencia, no operable) | 0.9898 | — | — | −0.0199 |
| **logit + calibración Dirichlet/MLR (EXP06)** | **1.00968** | 0.60429 | 0.20507 | −0.00006 |
| **hgb sin calibrar (EXP05_hgb_final)** | **1.00974** | 0.60443 | 0.20513 | — |
| logit sin calibrar | 1.01029 | 0.60454 | 0.20509 | +0.00055 |
| **Elo EXP02 (K=20, HFA=90, reg=0, MOV=on)** | **1.01453** | 0.60779 | 0.20656 | +0.00479 |
| elo_ordered EXP01 (K=20, HFA=65, reg=0.33, MOV=on) | 1.01666 | 0.60920 | 0.20720 | +0.00692 |
| base_rate EXP01 | 1.07365 | 0.6494 | 0.2266 | +0.06391 |

**Hallazgos principales**

1. **Elo (EXP02):** de los 4 parámetros, solo dos tienen efecto material y monótono: la
   **regresión entre temporadas** (0 es mejor que 0.33/0.5; +0.0041 de log-loss al pasar de 0 a
   0.5) y el **multiplicador por diferencia de goles** (+0.0013 a favor de activarlo). `K` es de
   segundo orden y está confundido con la pendiente del logit; `HFA` es prácticamente **no
   identificable** (0.00014 entre 40 y 90) porque entra como constante en `elo_diff` y los dos
   umbrales la absorben. El mejor Elo baja val de 1.01666 a **1.01453** (−0.0021, IC95 %
   [−0.0037, −0.0007] pareado por división, 99.7 % de remuestras a favor).
2. **Calibración (EXP06):** con el dataset limpio v1.1 la calibración **ya no aporta** en val
   al mejor modelo: hgb empeora con todos los métodos (Δ ≥ 0), y solo elo_ordered (−0.00085 con
   vector scaling, 92 % de remuestras a favor) y logit (−0.00061 con Dirichlet, 90 %) mejoran,
   con IC que cruza 0 en ambos casos. Sí mejora la **fiabilidad** (ECE top de logit 0.0182 →
   0.0104 con Dirichlet) y en walk-forward las ganancias son negativas y consistentes
   (−0.0004 a −0.0010), pero el tamaño del efecto es despreciable frente a la brecha con el
   mercado. **No hay evidencia para afirmar que calibrar mejore el log-loss de val.**
3. **Goles (EXP03):** la rejilla de `alpha` pedida {0.1, 1, 10} es **degenerada** en las unidades
   de `sklearn` (la penalización se divide por `n_samples`, no por la suma de pesos): con
   alpha ≥ 0.1 el ataque/defensa se aplasta (sd ≈ 0.01) y el modelo cae a la frecuencia base.
   Con la rejilla extendida (0.003-0.03) el mejor Poisson/DC llega a val **1.0262**, muy lejos
   del modelo de features (1.0097). **Dixon-Coles sí aporta**: ρ estimado (media −0.043, 87 % de
   divisiones negativo) mejora 0.00084 (IC95 % [0.00022, 0.00141], 99.6 % de remuestras) sobre
   Poisson con los mismos λ.
4. **Empates (EXP10):** P(empate) está razonablemente calibrada (ECE 0.0080; media 0.2639 vs
   0.2691 observada). El sesgo de argmax es real pero **no absoluto**: `hgb` predice empate el
   0.80 % de las veces (841 de 105.372) frente al 26.62 % real; `elo_ordered` y `base_rate`,
   0.00 %. Un umbral sobre P(D) **no** mejora la accuracy (Δ = +0.0002). Un modelo binario
   especializado (AUC 0.556) **no mejora** el 1X2: mezclarlo 50/50 deja el log-loss igual
   (Δ −0.00004, IC95 % [−0.00056, +0.00039]) y reemplazar P(D) lo empeora (−0.00067).
5. **El leakage de priors importaba:** al corregirlo (v1.1), hgb pasó de 1.00730 a **1.00974** y
   la calibración Dirichlet dejó de ayudarlo (antes −0.00112, ahora +0.00007). Es decir, ~0.0024
   del rendimiento aparente de hgb y toda su "mejora por calibración" venían del leakage de
   `home_prev_*`/`away_prev_*`. Cualquier conclusión anterior basada en 1.0073/1.0062 queda
   retirada.

**Recomendación de Motor A:** `hgb` sin calibrar (1.00974) o `logit + Dirichlet` (1.00968) —
estadísticamente empatados (Δ = 0.00006); elegir según simplicidad/explicabilidad. El Elo de
EXP02 queda como modelo simple de respaldo. Ningún modelo sin cuotas se acerca al mercado
(0.9898): la brecha de ~0.020 es de **información**, no de algoritmo.

## 1. Protocolo y verificación de equivalencia

- **Ventanas:** walk-forward expanding; para cada temporada S se ajusta con temporadas < S.
- **EXP02:** evaluación 2008/09-2023/24 (dev 2008-2022 = 108.678 partidos; val 2023 = 8.152).
  Los 1.142 partidos G1 recuperados por A05 son anteriores a 2008/09, así que el conjunto de
evaluación es idéntico al de la corrida previa: los números de EXP02 no cambian.
- **EXP06:** calibración evaluada 2010/11-2023/24 (105.372 partidos) + val 8.152.
- **EXP03:** evaluación 2010/11-2023/24 por coste computacional del ajuste por división.
- **EXP10:** modelo de empate desde 2014 (exige ≥ 20.000 partidos de entrenamiento).
- **Nunca test:** todos los cargadores filtran `season_start ≤ 2023` y lo verifican con `assert`;
  `load_exp01_predictions` descarta 2024/25+ antes de cualquier cálculo.
- **Semilla:** `SEED = 20261109` en bootstrap, permutaciones y modelos.

**Verificación de equivalencia (clave para que EXP02 sea comparable con EXP01):** el logit
ordenado reimplementado en `common.fit_ordered_logit` (mismos 3 parámetros que
`EloOrderedModel`, pero con gradiente analítico y L-BFGS en vez de Nelder-Mead) reproduce
exactamente la configuración por defecto de EXP01: val log-loss **1.01665** vs 1.0166 reportado
por el orquestador. La diferencia es < 1e-6. Esto valida que el barrido de 96 configuraciones
mide el Elo y no un cambio de optimizador.

---

## 2. EXP02 — Elo dinámico (prioridad 1)

**Script:** `models/a/experiments/exp02_elo.py` · **Artefactos:** `artifacts/A06_EXP02_elo_20261109/`
**Rejilla:** K ∈ {10, 20, 30, 40} × HFA ∈ {40, 65, 90} × regresión ∈ {0, 0.2, 0.33, 0.5} ×
MOV ∈ {off, on} = **96 configuraciones**, 16 temporadas cada una, 7 procesos (~6,6 min).

El Elo se recalcula con `features.build_features.elo_block` **importado** (no editado) y se
predice con el logit ordenado 1X2. El HFA entra en `elo_diff = elo_home + HFA − elo_away`.

### 2.1 Mejores configuraciones (val 2023/24)

| K | HFA | reg | MOV | dev log-loss | **val log-loss** | val Brier | val RPS |
|---:|---:|---:|:---:|---:|---:|---:|---:|
| 20 | 90 | 0.00 | on | 1.01766 | **1.01453** | 0.60779 | 0.20656 |
| 20 | 65 | 0.00 | on | 1.01764 | 1.01454 | 0.60780 | 0.20657 |
| 20 | 40 | 0.00 | on | 1.01762 | 1.01455 | 0.60781 | 0.20657 |
| 10 | 40 | 0.00 | on | 1.01842 | 1.01468 | 0.60785 | 0.20658 |
| 10 | 65 | 0.00 | on | 1.01852 | 1.01475 | 0.60789 | 0.20660 |
| 10 | 90 | 0.00 | on | 1.01863 | 1.01484 | 0.60795 | 0.20663 |
| 10 | 40 | 0.20 | on | 1.01754 | 1.01485 | 0.60793 | 0.20663 |
| 10 | 65 | 0.20 | on | 1.01760 | 1.01488 | 0.60795 | 0.20664 |
| 10 | 90 | 0.20 | on | 1.01768 | 1.01494 | 0.60798 | 0.20666 |
| 10 | 40 | 0.33 | on | 1.01774 | 1.01529 | 0.60821 | 0.20675 |
| … | | | | | | | |
| 40 | 40 | 0.50 | off | 1.02592 | 1.02430 | 0.61460 | 0.20963 |

Rango total: 1.01453-1.02432 (amplitud 0.0098, desviación típica entre configuraciones 0.0025).
El **mejor** es K=20, HFA=90, reg=0, MOV=on; el **peor** es K=40, reg=0.5, MOV=off.
La configuración por defecto de `features.parquet` (K=20, HFA=65, reg=0.33, MOV=on) da
val 1.01665 y queda fuera del top-30 de 96.

### 2.2 Márgenes por parámetro (media de val log-loss sobre las 96 configuraciones)

| Parámetro | Niveles (media val log-loss) | Amplitud | Lectura |
|---|---|---:|---|
| K | 10: 1.0164 · 20: 1.0171 · 30: 1.0189 · 40: 1.0210 | 0.0046 | monótono; K pequeño mejor |
| HFA | 40: 1.0184 · 65: 1.0183 · 90: 1.0183 | **0.00014** | **ruido / no identificable** |
| regresión | 0: 1.0165 · 0.2: 1.0177 · 0.33: 1.0186 · 0.5: 1.0206 | 0.0041 | monótono; 0 mejor |
| MOV | off: 1.0190 · on: 1.0177 | 0.0013 | activarlo mejor |

### 2.3 ¿Cuánto importa cada parámetro?

- **Regresión entre temporadas:** es el parámetro con efecto más claro y monótono. Regresar
  hacia 1500 al inicio de cada temporada borra información que el modelo ya había estimado; el
  coste es de +0.0041 de log-loss al pasar de 0 a 0.5. Que `reg=0` gane es consistente con la
  literatura reciente de Elo en fútbol cuando se recalibra el umbral cada temporada.
- **MOV:** +0.0013 a favor de activarlo; el multiplicador por goleada aporta información de
  margen que el resultado binario no captura. Es pequeño pero consistente en dev y val.
- **K:** 0.0047 de amplitud, pero **confundido con la pendiente `b`**: multiplicar todos los
  `elo_diff` por una constante y dividir `b` entre ella da predicciones idénticas. K no cambia
  solo la escala: cambia la mezcla entre historia reciente y antigua. K=10-20 (más peso al
  pasado reciente) gana; K=40 (ratings más "nerviosos") pierde. Efecto real pero de segundo orden.
- **HFA:** con el umbral libre, cualquier constante sumada a `elo_diff` se absorbe en `c1`/`c2`.
  Lo único que queda es el efecto dinámico (la HFA cambia la expectativa con la que se actualizan
  los ratings), y es despreciable: 1.4e-5. **No se puede concluir nada sobre la HFA óptima desde
  este diseño**; para estimarla habría que fijar la escala (p. ej. fijar `b`) o meterla como
  parámetro del modelo en vez de dentro del rating.

### 2.4 Significancia y estabilidad

- **Mejor vs configuración por defecto:** Δ = −0.00212; bootstrap pareado por división (B=2000,
  val): IC95 % [−0.00371, −0.00068]; 99.65 % de remuestras favorecen al mejor.
- **Mejor vs EXP01 `elo_ordered`:** prácticamente idéntico (−0.00210, IC95 % [−0.00372, −0.00064]),
  lo que confirma que la
  ganancia viene de la configuración de Elo, no de la reimplementación.
- **Riesgo de sobreajustar val:** se eligió 1 de 96 configuraciones sobre 8.152 partidos. Sin
  embargo, el ranking de dev coincide: el mejor en dev también es reg=0/MOV=on, y la ganancia
  dev (1.01766 vs 1.01895 = −0.00129) es del mismo orden que la de val. La elección es estable;
  la diferencia entre las 3 primeras configuraciones (2e-5) es ruido puro y no debe reportarse
  como señal.
- **Por temporada (mejor config):** el log-loss oscila entre 1.0054 (2017/18) y 1.0333
  (2020/21, temporada COVID con menos localía). La pendiente `b` se mantiene estable
  (−0.501 en 2008 → −0.459 en 2023): el Elo no se degrada con el tiempo.

| Temporada | n | log-loss | Brier | RPS | acc |
|---|---:|---:|---:|---:|---:|
| 2008/09 | 5.794 | 1.0124 | 0.6064 | 0.2054 | 0.4981 |
| 2012/13 | 7.709 | 1.0319 | 0.6200 | 0.2110 | 0.4792 |
| 2016/17 | 8.107 | 1.0077 | 0.6035 | 0.2051 | 0.5017 |
| 2018/19 | 7.670 | 1.0054 | 0.6011 | 0.2051 | 0.4999 |
| 2020/21 | 7.575 | 1.0334 | 0.6204 | 0.2128 | 0.4750 |
| 2022/23 | 8.158 | 1.0142 | 0.6070 | 0.2078 | 0.4949 |
| **2023/24 (val)** | **8.152** | **1.0145** | **0.6078** | **0.2066** | **0.4904** |

**Decisión EXP02:** documentar `K=20, HFA=65, reg=0, MOV=on` como configuración recomendada
(HFA irrelevante; se mantiene 65 por continuidad con el pipeline actual) y **no** introducir
`reg` en la generación de features hasta que A05 lo apruebe (implica regenerar
`features.parquet`, fuera del alcance de A06). Predicciones del ganador guardadas en
`artifacts/A06_EXP02_elo_20261109/predictions.csv` (116.830 filas, formato de contrato).

---

## 3. EXP06 — Calibración (prioridad 2)

**Script:** `models/a/experiments/exp06_calibration.py` · **Artefactos:**
`artifacts/A06_EXP06_calibration_20261109/`
**Entrada (limpia, dataset v1.1):** `EXP01_final_20261109` para `elo_ordered` y `logit`, y
`EXP05_hgb_final_20261109` para `hgb` (hgb se regeneró aparte porque `EXP01_final` no lo incluía).
134.278 partidos OOS 2005-2023, filtrados a ≤ 2023.
**Anti-trampa:** para cada temporada S ∈ [2010, 2023] el calibrador se ajusta **solo** con
predicciones OOS de temporadas < S. val 2023/24 usa el calibrador ajustado en 2005-2022.

Métodos: (a) sin calibrar; (b) temperature scaling (1 parámetro); (c) vector scaling
(z_k = a_k·log p_k + b_k con b_A = 0, 5 parámetros); (d) isotónica one-vs-rest por clase +
renormalización; (e) MLR/Dirichlet: regresión logística multinomial sobre log p (6 parámetros).

### 3.1 Resultados en val 2023/24 (8.152 partidos)

| Base | Método | log-loss | Brier | RPS | ECE top | ECE empate | Δ log-loss vs sin calibrar |
|---|---|---|---:|---:|---:|---:|---:|
| elo_ordered | sin calibrar | 1.01666 | 0.60920 | 0.20720 | 0.0143 | 0.0041 | — |
| elo_ordered | temperature | 1.01649 | 0.60906 | 0.20713 | 0.0131 | 0.0018 | −0.00017 |
| elo_ordered | vector | **1.01580** | 0.60853 | 0.20696 | 0.0136 | 0.0070 | −0.00085 |
| elo_ordered | isotonic | 1.01735 | 0.60880 | 0.20702 | 0.0115 | 0.0046 | +0.00069 |
| elo_ordered | dirichlet | 1.01626 | 0.60880 | 0.20710 | 0.0127 | 0.0071 | −0.00040 |
| logit | sin calibrar | 1.01029 | 0.60454 | 0.20509 | 0.0182 | 0.0103 | — |
| logit | temperature | 1.01012 | 0.60450 | 0.20509 | 0.0113 | 0.0057 | −0.00018 |
| logit | vector | 1.01038 | 0.60467 | 0.20514 | 0.0125 | 0.0105 | +0.00009 |
| logit | isotonic | 1.01023 | 0.60454 | 0.20511 | 0.0103 | 0.0076 | −0.00006 |
| logit | dirichlet | **1.00968** | 0.60429 | 0.20507 | 0.0104 | 0.0079 | **−0.00061** |
| hgb | sin calibrar | **1.00974** | 0.60443 | 0.20513 | 0.0102 | 0.0080 | — |
| hgb | temperature | 1.00984 | 0.60448 | 0.20517 | 0.0095 | 0.0080 | +0.00010 |
| hgb | vector | 1.01001 | 0.60465 | 0.20522 | 0.0138 | 0.0092 | +0.00027 |
| hgb | isotonic | 1.00980 | 0.60455 | 0.20521 | 0.0144 | 0.0094 | +0.00006 |
| hgb | dirichlet | 1.00981 | 0.60454 | 0.20521 | 0.0115 | 0.0047 | +0.00007 |

### 3.2 Significancia (bootstrap pareado por división, B=2000)

| Base | Método | Δ val (método − identidad) | IC95 % val | % remuestras a favor | Δ walk-forward 2010-2023 | % a favor WF |
|---|---|---:|---|---:|---:|---:|
| elo_ordered | temperature | −0.00017 | [−0.00088, +0.00052] | 67.5 % | −0.00026 | 99.9 % |
| elo_ordered | vector | −0.00085 | [−0.00209, +0.00031] | 92.4 % | −0.00096 | 100 % |
| elo_ordered | isotonic | +0.00069 | [−0.00184, +0.00433] | 38.5 % | −0.00030 | 88.6 % |
| elo_ordered | dirichlet | −0.00040 | [−0.00250, +0.00158] | 66.2 % | −0.00092 | 100 % |
| logit | temperature | −0.00018 | [−0.00079, +0.00043] | 70.9 % | −0.00035 | 99.8 % |
| logit | vector | +0.00009 | [−0.00068, +0.00083] | 40.9 % | −0.00038 | 99.7 % |
| logit | isotonic | −0.00006 | [−0.00096, +0.00080] | 56.4 % | +0.00010 | 35.4 % |
| logit | dirichlet | −0.00061 | [−0.00150, +0.00031] | 90.2 % | −0.00072 | 100 % |
| hgb | temperature | +0.00010 | [−0.00033, +0.00053] | 31.9 % | −0.00014 | 94.6 % |
| hgb | vector | +0.00027 | [−0.00049, +0.00097] | 24.4 % | −0.00017 | 90.4 % |
| hgb | isotonic | +0.00006 | [−0.00074, +0.00077] | 42.8 % | +0.00042 | 6.6 % |
| hgb | dirichlet | +0.00007 | [−0.00076, +0.00095] | 45.3 % | −0.00052 | 99.9 % |

**Lectura:** en val **ningún** calibrador alcanza significación al 95 % (todos los IC cruzan 0).
Los mejores son vector scaling sobre elo_ordered (92.4 % de remuestras a favor) y Dirichlet sobre
logit (90.2 %); sobre hgb todos los métodos son neutros o ligeramente peores. En walk-forward,
temperature/vector/Dirichlet son consistentemente negativos (~−0.0002 a −0.0010 con 90-100 % de
remuestras a favor) pero isotónica es inestable. Conclusión: **la calibración no es una palanca
de mejora del Motor A**; en el mejor caso empata.

### 3.3 Fiabilidad y ECE: calibrar sí mejora la fiabilidad

| logit, val | ECE top | ECE local | ECE empate | ECE visitante |
|---|---:|---:|---:|---:|
| sin calibrar | 0.0182 | — | 0.0103 | — |
| temperature | **0.0113** | — | 0.0057 | — |
| dirichlet | **0.0104** | — | 0.0079 | — |

| hgb, val | ECE top | ECE empate |
|---|---:|---:|
| sin calibrar | 0.0102 | 0.0080 |
| temperature | 0.0095 | 0.0080 |
| dirichlet | 0.0115 | **0.0047** |

El ECE top-label de `logit` cae un 43 % con temperature o Dirichlet **sin que el log-loss mejore
de forma medible**. Es el patrón inverso al de la corrida contaminada (donde el ECE empeoraba):
con features limpias, logit está peor calibrado de lo que sugería su log-loss, y **calibrar
mejora la fiabilidad aunque no la verosimilitud**. Para un producto que muestre probabilidades al
usuario, eso sí es valor; para el ranking por log-loss, no.

Curvas completas por clase y método: `artifacts/A06_EXP06_calibration_20261109/reliability_val.csv`.

### 3.4 La trampa de ajustar y evaluar en la misma temporada

| Sistema (val 2023/24) | log-loss walk-forward | log-loss in-season | diferencia |
|---|---:|---:|---:|
| logit + isotónica | 1.01023 | **1.00409** | −0.0061 |
| hgb + isotónica | 1.00980 | **1.00459** | −0.0052 |
| elo_ordered + isotónica | 1.01735 | **1.01029** | −0.0071 |

Ajustar el calibrador en la misma temporada que se evalúa "mejora" 0.005-0.007 de log-loss: es
puro sobreajuste (la isotónica tiene decenas de parámetros y memoriza la temporada). **Todos los
números de las tablas 3.1-3.2 son walk-forward**; los in-season solo se reportan como diagnóstico.

**Decisión EXP06:** **no adoptar** la calibración como parte del Motor A por defecto. Se guarda
`logit + Dirichlet` como variante calibrada (mejor log-loss de val por 0.00006 y mejor ECE) y
`temperature` si el producto necesita probabilidades más fiables sin cambiar el ranking.
Predicciones calibradas (mejor método por modelo base, 2010-2023) en
`artifacts/A06_EXP06_calibration_20261109/predictions.csv` (316.116 filas, formato de contrato).

---

## 4. EXP03 — Modelos de goles: Poisson vs Dixon-Coles (prioridad 3)

**Script:** `models/a/experiments/exp03_goals.py` · **Artefactos:** `artifacts/A06_EXP03_goals_20261109/`
**Diseño:** ataque/defensa por equipo y división (`PoissonRegressor` con L2), goles de local y
visitante apilados, pesos temporales `0.5^(edad_días/half_life)` normalizados a media 1.
λ_home/λ_away → matriz de marcadores 0..10 → P(H), P(D), P(A). Variante Poisson: ρ = 0;
variante DC: ρ estimado por división (rejilla −0.30..0.30, paso 0.005) maximizando la
verosimilitud ponderada de las 4 celdas bajas. Walk-forward 2010/11-2023/24 (18 combinaciones,
824 s en un proceso; la versión paralela aborta en este macOS — ver §8).

### 4.1 Hallazgo previo: la rejilla de alpha pedida es degenerada

`PoissonRegressor` divide la verosimilitud por `n_samples`, no por la suma de pesos. Con pesos
que suman `n_eff << n`, `alpha = 1` es una penalización enorme para ~40 coeficientes: el
ataque/defensa se aplasta (sd ≈ 0.012 en Premier League) y el modelo cae a la frecuencia base.
Por eso se añade una **rejilla extendida** {0.003, 0.01, 0.03}, marcada como tal en las tablas.
Con la rejilla pedida, el mejor resultado es 1.0426; con la extendida, 1.0262. No es un fallo del
modelo sino de la escala de `alpha` en `sklearn`.

### 4.2 Resultados (val 2023/24, 8.152 partidos; tabla completa de 36 filas en `summary_val.csv`)

| half-life | alpha | rejilla | variante | dev log-loss | **val log-loss** | val Brier | val RPS |
|---:|---:|:---:|:---|---:|---:|---:|---:|
| 730 | 0.003 | extendida | **Dixon-Coles** | 1.02819 | **1.02622** | 0.61562 | 0.21021 |
| 730 | 0.010 | extendida | Dixon-Coles | 1.02838 | 1.02655 | 0.61575 | 0.21028 |
| 365 | 0.003 | extendida | Dixon-Coles | 1.02902 | 1.02679 | 0.61605 | 0.21043 |
| 365 | 0.010 | extendida | Dixon-Coles | 1.02877 | 1.02686 | 0.61600 | 0.21041 |
| 730 | 0.003 | extendida | Poisson | 1.02872 | 1.02706 | 0.61610 | 0.21029 |
| 365 | 0.010 | extendida | Poisson | 1.02917 | 1.02760 | 0.61640 | 0.21047 |
| 180 | 0.003 | extendida | Dixon-Coles | 1.03260 | 1.03035 | 0.61849 | 0.21159 |
| 365 | 0.100 | pedida | Dixon-Coles | 1.04176 | 1.04264 | 0.62674 | 0.21549 |
| 365 | 1.000 | pedida | Dixon-Coles | 1.07325 | 1.07536 | 0.65055 | 0.22711 |
| 365 | 10.00 | pedida | Dixon-Coles | 1.08525 | 1.08657 | 0.65881 | 0.23121 |

- **half-life:** 730 > 365 > 180 días en todas las parejas (2 años de historia pesan más que 6
  meses para estimar fuerza de equipo). La diferencia 730 vs 365 es ~0.0006; 365 vs 180, ~0.0035.
- **alpha:** monótono dentro de cada rejilla (menos regularización, mejor), con el óptimo en el
  borde inferior de la extendida (0.003); no se exploró más abajo para no sobreajustar val.
- **Comparación con el Motor A de features:** el mejor modelo de goles (1.0262) está **0.020 por
  detrás** de hgb (1.0073). Los goles son una señal mucho más ruidosa que las 55 features
  deportivas; el modelo de goles no compite como Motor A principal.

### 4.3 ¿Aporta algo Dixon-Coles?

ρ estimado por división en val: **media −0.043, mediana −0.045, 87 % de divisiones negativo**
(rango −0.135 a +0.060). Es decir, el patrón clásico: menos empates 0-0 y 1-1 de lo que predice
el Poisson independiente, más 0-1 y 1-0.

**DC mejora a Poisson en las 18 parejas** (mismos λ, solo cambia ρ). Para el mejor par:
Δ log-loss = **−0.00084** (IC95 % [−0.00141, −0.00022], 99.6 % de remuestras a favor, bootstrap
pareado por división) y Δ Brier −0.00048. El efecto es real pero diminuto: **τ aporta valor
estadístico, no valor práctico** para el 1X2.

Esto **no contradice a A09**: allí se forzaba un ρ negativo fijo en un motor heurístico y empeoraba;
aquí ρ se estima por división y temporada, y la mejora sobre ρ=0 es de 0.0008, del mismo orden que
el ruido de temporada a temporada.

**Decisión EXP03:** descartar el modelo de goles como Motor A; conservar DC (ρ estimado) por si en
el futuro se derivan mercados de goles/OU, donde la matriz de marcadores sí es el objeto de
interés. Predicciones de val del mejor modelo en `predictions.csv` (8.152 filas, formato contrato).

---

## 5. EXP10 — Empates (prioridad 4)

**Script:** `models/a/experiments/exp10_draws.py` · **Artefactos:**
`artifacts/A06_EXP10_draws_20261109/`
**Base:** predicciones OOS de `hgb` limpio (2010-2023, 105.372 partidos; 26.62 % de empates).

### 5.1 Fiabilidad de P(empate) — val 2023/24

| Bin de P(D) | n | P(D) media | Empates observados | Sesgo |
|---|---:|---:|---:|---:|
| 0.0-0.1 | 80 | 0.0864 | 0.1625 | +0.0761 |
| 0.1-0.2 | 933 | 0.1617 | 0.1533 | −0.0084 |
| 0.2-0.3 | 5.149 | 0.2630 | 0.2723 | +0.0093 |
| 0.3-0.4 | 1.990 | 0.3212 | 0.3196 | −0.0016 |

ECE de empate en val = **0.0080**; media predicha 0.2639 vs observada 0.2691 (−0.5 pp). El único
bin mal calibrado es el 0-0.1 (80 partidos, +7.6 pp), que es ruido por tamaño muestral. En la
masa (0.2-0.4) la calibración es excelente. **No hay un sesgo global de empates** como el que
reportó A09 para los motores heurísticos (−8 pp).

### 5.2 Sesgo de argmax: cuántas veces se predice empate

| Modelo | Empates predichos por argmax (2010-2023) | % | Accuracy |
|---|---:|---:|---:|
| base_rate | 0 | 0.00 % | 0.4460 |
| elo_ordered | 0 | 0.00 % | 0.4909 |
| logit | 937 | 0.89 % | 0.4933 |
| hgb (v1.1) | 841 | 0.80 % | 0.4914 |
| **empates reales** | **28.052** | **26.62 %** | — |

Los modelos lineales **nunca** predicen empate y hgb solo el 0.8 %, frente al 26.6 % real: el
argmax evita estructuralmente la clase minoritaria. Es un sesgo de la **decisión**, no de la
probabilidad (que está bien calibrada).

### 5.3 ¿Un umbral mejora algo?

Umbral walk-forward (se elige t con temporadas < S y se aplica en S; rejilla 0.18-0.40):
**t ≈ 0.39-0.40** en las 12 temporadas evaluadas. Δ accuracy media = **+0.00024**
(2-18 empates llamados por temporada, 98 en total). El mejor umbral in-sample (0.39) da
0.4917 vs 0.4914 del argmax. **Un umbral no aporta nada**: mover la decisión hacia el empate
sacrifica aciertos de local/visitante en la misma proporción.

### 5.4 Modelo especializado de empate y mezcla

Modelo binario HGB (mismas 55 features deportivas), walk-forward 2014-2023 (≥ 20.000 partidos de
entrenamiento): **AUC media 0.5557** (rango 0.5385-0.5690). El empate es predecible por encima
del azar, pero mucho peor que el 1X2.

| Sistema (val 2023/24) | log-loss | Brier | RPS | ECE empate | accuracy |
|---|---:|---:|---:|---:|---:|
| hgb base | **1.00974** | 0.60443 | 0.20513 | 0.0080 | 0.4950 |
| hgb + P(D) especializada (replace) | 1.01041 | 0.60455 | 0.20523 | 0.0079 | 0.4935 |
| hgb + mezcla 50/50 (blend) | 1.00978 | 0.60445 | 0.20515 | 0.0079 | 0.4946 |

Bootstrap pareado por división (val):

| Sistema | Δ log-loss (base − sistema) | IC95 % | % a favor |
|---|---:|---|---:|
| replace | −0.00067 | [−0.00169, +0.00020] | 7.9 % |
| blend 50/50 | −0.00004 | [−0.00056, +0.00039] | 44.5 % |

Con features limpias, **el modelo especializado de empate ya no ayuda**: empeora ligeramente el
log-loss (replace −0.00067; blend −0.00004) y no mejora el RPS. En la corrida contaminada
parecía mejorar 0.00135: otra consecuencia del leakage de priors.

**Decisión EXP10:** descartar el umbral y el modelo especializado. Documentar el sesgo de argmax
como limitación de la métrica de accuracy (no "corregirlo" moviendo decisiones).

---

## 6. Recomendación de Motor A

**Candidatos (val 2023/24, dataset v1.1):**

| Candidato | val log-loss | Evidencia |
|---|---:|---|
| logit + Dirichlet | **1.00968** | −0.00061 vs logit; 90.2 % de remuestras a favor; IC95 % [−0.0015, +0.0003] |
| hgb sin calibrar | **1.00974** | mejor modelo de features; ningún calibrador lo mejora (Δ ≥ 0) |
| Elo EXP02 (K=20, reg=0, MOV=on) | 1.01453 | −0.00212 vs Elo por defecto; IC95 % [−0.0037, −0.0007] |

**Recomendación:** Motor A = **hgb sin calibrar** (1.00974) como modelo principal, con
**logit + Dirichlet** (1.00968) como alternativa cuando se necesiten probabilidades más
fiables/explicables (su ECE top es 0.0104 frente a 0.0102 de hgb, pero su log-loss es 0.00006
mejor: están estadísticamente empatados). El **Elo de EXP02** queda como modelo simple de
respaldo y como sanity check (1.01453, solo 0.005 peor que el modelo completo).

**Justificación:**
1. hgb y logit+Dirichlet están empatados (Δ = 0.00006, muy por debajo del error de muestreo);
   elegir hgb evita una capa de calibración que no aporta y que en val ya empeora ligeramente.
2. El Elo con reg=0/MOV=on es la mejora individual más grande y robusta de todo el informe
   (−0.0021 con IC que excluye 0); si se exige interpretabilidad total, es el modelo a usar.
3. Las tres capas propuestas en la prioridad del encargo —calibración, blend de empate, umbral—
   **no superan a sus baselines** con datos limpios. Se documentan como descartadas.

**Lo que NO se recomienda:** (a) el modelo de goles Poisson/DC como Motor A principal
(val 1.026, muy por detrás); (b) regresión entre temporadas > 0 en el Elo; (c) umbrales de
empate; (d) blend con el modelo especializado de empate (neutro/negativo); (e) declarar que
algún modelo "iguala al mercado": Pinnacle cierre marca 0.9898 y el mejor Motor A 1.0097, una
brecha de 0.020.

**Nota de versión:** una corrida previa sobre `features.parquet` v1.0 (priors con leakage)
recomendaba `hgb + Dirichlet + blend de empate` con val 1.00595. **Esa recomendación queda
retirada**: el leakage inflaba hgb en ~0.0024 y producía una mejora de calibración que no
existe con datos limpios.

---

## 7. Limitaciones y riesgos

1. **Cambio de dataset a mitad del encargo:** EXP02/EXP03 se reejecutaron completos sobre v1.1;
   EXP06/EXP10 se reejecutaron contra las predicciones limpias de `EXP01_final` y
   `EXP05_hgb_final`. Los números de la corrida v1.0 (hgb 1.00730, hgb+Dirichlet 1.00618,
   blend de empate 1.00595) **no son válidos** y no se mezclan con los actuales.
2. **Selección sobre val:** EXP02 elige 1 de 96 configuraciones y EXP06 1 de 5 métodos sobre
   8.152 partidos. La evidencia de dev y del walk-forward acompaña, pero el IC de val puede ser
   optimista. No se ha usado test, así que la confirmación final sigue pendiente.
3. **Bloques de bootstrap gruesos:** en val los bloques son divisiones (22), lo que hace el IC
   conservador/ruidoso; para diferencias < 0.001 el IC es ancho y casi nunca excluye 0.
4. **`b` y K están confundidos** en el diseño de Elo: parte de la variación de K se absorbe en la
   pendiente del logit. El barrido mide el efecto conjunto, no K "puro".
5. **HFA no identificable** en este diseño (ver §2.3). No se debe interpretar el resultado como
   "la HFA óptima es 90".
6. **EXP03:** la rejilla pedida de alpha es degenerada; se reporta el hallazgo y una rejilla
   extendida. Los ascendidos no vistos en una división reciben la media de la liga.
7. **EXP10:** el modelo de empate usa las mismas features que el modelo base (ensemble
   correlacionado, no información nueva) y el peso 0.5 no se optimizó.
8. **Sin cuotas:** por diseño. El benchmark de mercado se usa solo como cota de información.
9. **Fallo de infraestructura documentado:** `ProcessPoolExecutor` con `sklearn` abortó dos veces
   en este macOS (`BrokenProcessPool`) para EXP03; la corrida reportada se ejecutó con
   `--workers 1`. EXP02 y EXP06 sí paralelizaron correctamente.

---

## 8. Reproducibilidad

```bash
cd research/prediction-lab
./.venv/bin/python models/a/experiments/exp02_elo.py --workers 7      # 359 s
./.venv/bin/python models/a/experiments/exp06_calibration.py          # ~4 min
./.venv/bin/python models/a/experiments/exp03_goals.py --workers 1    # 824 s
./.venv/bin/python models/a/experiments/exp10_draws.py                # ~3 min
```

| Experimento | Artefacto | Contenido |
|---|---|---|
| EXP02 | `artifacts/A06_EXP02_elo_20261109/` | `sweep_val.csv` (96 configs), `metrics.json`, `predictions.csv` (116.830), `reliability_val_best.csv` |
| EXP06 | `artifacts/A06_EXP06_calibration_20261109/` | `metrics.json` (fuentes por modelo), `metrics_by_season.csv`, `reliability_val.csv`, `predictions.csv` (316.116) |
| EXP03 | `artifacts/A06_EXP03_goals_20261109/` | `summary_val.csv` (36 filas), `metrics_by_season.csv`, `rho_by_div.csv`, `predictions.csv` (val) |
| EXP10 | `artifacts/A06_EXP10_draws_20261109/` | `metrics.json`, `draw_reliability_val.csv`, `threshold_sweep.csv`, `threshold_walk_forward.csv`, `spec_draw_reliability.csv` |

**Código:** `models/a/experiments/common.py` (métricas del contrato, logit ordenado rápido,
bootstrap por bloques, resolución de predicciones limpias, escritura de predicciones),
`exp02_elo.py`, `exp03_goals.py`, `exp06_calibration.py`, `exp10_draws.py` (todos con semilla
fija y sin acceso a test).

**Trazabilidad:** `SEED=20261109`; `common.find_clean_predictions` garantiza que EXP06/EXP10 solo
consumen `EXP01_final_20261109` / `EXP05_hgb_final_20261109` y **nunca** las predicciones
contaminadas de `EXP01_baselines_20261109`.
