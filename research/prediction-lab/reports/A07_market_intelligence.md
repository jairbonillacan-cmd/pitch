# A07 — Inteligencia de mercado (Motor B)

**SUBAGENTE 07 · MARKET INTELLIGENCE** · 2026-11-09 · semilla 20261109
Particiones `dev` (≤ 2022/23) + `val` (2023/24). **`test` no se ha usado en ningún cálculo.**
Código en `models/b/analysis/`; artefactos en `models/b/analysis/artifacts/`.

## 1. Resumen ejecutivo

1. **Gana el de-vig *power***: cierre Pinnacle (n = 93.624) 0,99670 frente a 0,99694 de proporcional
   y 0,99675 de Shin; Δ = +0,000238 (IC95 % +0,000130 a +0,000348), replicado en las cuatro
   poblaciones. Real pero minúsculo (0,3–1,2 % de la ventaja del mercado sobre la tasa base, 0,0751
   nats); importa para el precio (ECE 0,0091 → 0,0055), no para el log-loss.
2. **El mercado no es batible**: el Motor A pierde +0,0188 (logit) y +0,0174 (HGB) en `val`
   (n = 8.148), con IC que excluyen el cero en **23/23 divisiones** y **4/4 bandas**; mezclarlo no
   aporta (peso óptimo del mercado 1,00/0,90; Δ en `val` −0,00006).
3. **Un clasificador con cuotas es peor que el de-vig** (HGB 0,99035 vs 0,98984; sobreajuste 0,98168
   en `dev`). Una logística de 12 parámetros gana −0,00054 (IC −0,00090 a −0,00017), pero no es
   estable. **Recomendación**: de-vig *power* + calibración opcional de 12 parámetros condicionada a
   walk-forward; nunca un clasificador que consuma cuotas en crudo.

## 2. Datos y reglas

| Población | Fase | Fuente | Temporadas | n | Margen | Papel |
|---|---|---|---|---:|---:|---|
| `close_ps` | cierre | Pinnacle | 2012/13–2023/24 | 93.624 | 2,81 % | referencia |
| `close_b365` | cierre | Bet365 | 2019/20–2023/24 | 28.589 | 6,15 % | contraste |
| `open_b365` | apertura | Bet365 | 2002/03–2023/24 | 125.299 | 7,44 % | robustez |
| `open_ps` | apertura | Pinnacle | 2012/13–2023/24 | 68.171 | 2,96 % | robustez |

El de-vig es una transformación **fila a fila** (α y z se resuelven dentro de cada partido), sin
parámetros entre partidos: evaluarlo en `dev` es selección de hiperparámetro legítima y `val`
confirma. **Nada se concluye con n < 500**: una celda temporada×división de una liga de 20 equipos
tiene ~380 partidos, así que el veredicto se apoya en temporadas completas (~5.800) y divisiones
agregadas (≥ 2.000); en `val` solo 3 divisiones superan n = 500.

## 3. EXP08a — ¿Qué método de de-vig gana?

| Población | Método | log-loss | Brier | RPS | ECE | n |
|---|---|---:|---:|---:|---:|---:|
| cierre Pinnacle | proporcional | 0,99694 | 0,59585 | 0,20168 | 0,0091 | 93.624 |
| cierre Pinnacle | **power** | **0,99670** | **0,59573** | **0,20163** | **0,0055** | 93.624 |
| cierre Pinnacle | Shin | 0,99675 | 0,59575 | 0,20164 | 0,0057 | 93.624 |
| cierre Bet365 (prop → power) | **power** | 0,99213 → **0,99163** | 0,59204 → 0,59178 | 0,20047 → 0,20035 | 0,0098 → 0,0062 | 28.589 |
| apertura Bet365 (prop → power) | **power** | 0,99735 → **0,99649** | 0,59621 → 0,59573 | 0,20115 → 0,20094 | 0,0115 → 0,0035 | 125.299 |
| apertura Pinnacle (prop → power) | **power** | 0,99448 → **0,99423** | 0,59405 → 0,59392 | 0,20094 → 0,20088 | 0,0062 → 0,0051 | 68.171 |

En `val`, cierre Pinnacle power = **0,98984** (proporcional 0,99037; Shin 0,98995; n = 8.148),
coincidiendo con el 0,9898 del brief.

**¿Estable o ruido?** Bootstrap pareado por bloques temporada×división, Δ = pérdida(proporcional) −
pérdida(power); Δ > 0 ⇒ power mejor:

| Población | Δ log-loss | IC95 % | Δ Brier | Temporadas ganadas | Divisiones ganadas |
|---|---:|---|---:|---|---|
| cierre Pinnacle | +0,000238 | +0,000130 a +0,000348 | +0,00009 | 17/24 (p = 0,064) | 17/23 (p = 0,0026) |
| cierre Bet365 | +0,000499 | +0,000110 a +0,000919 | +0,00022 | 3/5 (p = 0,375) | 8/17 (p = 0,63) |
| apertura Bet365 | +0,000867 | +0,000632 a +0,001120 | +0,00043 | **20/22** (p = 1,1e-5) | 13/17 (p = 0,049) |
| apertura Pinnacle | +0,000253 | +0,000120 a +0,000395 | +0,00013 | 10/12 (p = 0,039) | 13/17 (p = 0,049) |

Cuatro razones para no llamarlo ruido: (i) el IC excluye el cero en las cuatro poblaciones y en un
sentido único; (ii) hay **gradiente por margen** —Δ(power − proporcional) va de −0,00027 a −0,00179
entre Q1 y Q4 en apertura Bet365 y de −0,00057 a −0,00146 en cierre Bet365 (n ≈ 31.300 y ≈ 7.145)—,
que es mecanismo y no azar; (iii) 21 de 22 temporadas de apertura Bet365 (signos p = 1,1e-5);
(iv) la calibración lo confirma. **Contra-argumento honesto:** en cierre Bet365 la evidencia es
débil (3/5 temporadas, 8/17 divisiones, IC ancho).

**Calibración.** Brecha observada − implícita por banda (cierre Pinnacle, 3 resultados por partido):

| Banda de p | n (obs.) | proporcional | power | Shin |
|---|---:|---:|---:|---:|
| < 0,10 | 7.935 | **−0,0155** | **−0,0063** | −0,0076 |
| 0,10–0,20 | 33.351 | −0,0055 | −0,0013 | −0,0025 |
| 0,20–0,30 | 105.132 | −0,0040 | −0,0016 | −0,0023 |
| 0,30–0,40 | 60.498 | +0,0003 | +0,0005 | +0,0004 |
| 0,40–0,50 | 34.192 | +0,0067 | +0,0042 | +0,0045 |
| 0,50–0,60 | 20.490 | +0,0061 | −0,0015 | +0,0011 |
| ≥ 0,60 | 19.274 | **+0,0184** | **+0,0063** | +0,0098 |

Proporcional reproduce el sesgo favorito-longshot de manual: infravalora a los favoritos 1,84 pp y
sobrevalora los *longshots* 1,55 pp. Power reduce ambas brechas ~60–65 % (ECE 0,0091 → 0,0055; en
apertura Bet365, 0,0115 → 0,0035) y lleva la pendiente de calibración de 1,058–1,098 a 0,992–1,019.

**Veredicto.** **Gana *power*:** mejora en las cuatro poblaciones con IC excluyendo el cero, gana la
mayoría de temporadas y divisiones con muestra y muestra gradiente monótono con el margen. Shin
queda a −0,000046 (IC −0,000083 a −0,000009), indistinguible y más caro. La magnitud es irrelevante
para el log-loss (0,02–0,09 %) pero no para el precio: 1,8 pp en favoritos claros importan si Motor
B produce probabilidades para valor esperado o *staking*.

## 4. EXP07 — Eficiencia del mercado y sesgos

Población: cierre Pinnacle power, n = 93.624 (dev 85.476 + val 8.148). Tasa base en `dev`: H 45,28 %,
D 26,88 %, A 27,84 % (log-loss 1,0720). **La ventaja del mercado sobre la tasa base es 0,0751 nats**:
ese es el listón.

| Banda | n (obs.) | implícito | observado | brecha | IC95 % observado |
|---|---:|---:|---:|---:|---|
| < 0,10 | 7.935 | 0,0699 | 0,0636 | −0,0063 | 0,0584–0,0692 |
| 0,10–0,20 | 33.351 | 0,1585 | 0,1572 | −0,0013 | 0,1535–0,1609 |
| 0,20–0,30 | 105.132 | 0,2597 | 0,2581 | −0,0016 | 0,2553–0,2610 |
| 0,30–0,40 | 60.498 | 0,3386 | 0,3391 | +0,0005 | 0,3354–0,3429 |
| 0,40–0,50 | 34.192 | 0,4468 | 0,4510 | +0,0042 | 0,4459–0,4561 |
| 0,50–0,60 | 20.490 | 0,5466 | 0,5451 | −0,0015 | 0,5381–0,5521 |
| ≥ 0,60 | 19.274 | 0,7014 | 0,7077 | +0,0063 | 0,7011–0,7142 |

ECE 0,0055 (dev 0,0057; val 0,0079), pendiente 1,019 (val 1,044). El mercado está **muy bien
calibrado**, con residuo pequeño y sistemático: favoritos infravalorados (+0,63 pp) y *longshots*
sobrevalorados (−0,63 pp). En `val` el residuo de ≥ 0,60 es mayor (+2,32 pp; n = 1.675 obs ≈ 558
partidos; IC 0,7096–0,7520), pero una temporada no lo separa de ruido.

| Banda de favoritismo | n | p_max impl. | p_max obs. | brecha favorito | brecha empate |
|---|---:|---:|---:|---:|---:|
| Muy abierto (< 0,38) | 11.625 | 0,3636 | 0,3512 | −0,0124 | **+0,0102** |
| Igualado (0,38–0,45) | 26.795 | 0,4140 | 0,4163 | +0,0023 | +0,0055 |
| Favorito moderado (0,45–0,55) | 26.541 | 0,4948 | 0,4959 | +0,0012 | +0,0078 |
| Favorito claro (≥ 0,55) | 28.663 | 0,6596 | 0,6633 | +0,0037 | −0,0041 |

En partidos muy abiertos el mercado **sobreconfía en el favorito** (−1,24 pp), y **el empate está
infravalorado** en todos los tramos salvo en los favoritos claros (+0,55 a +1,02 pp). Ese segundo
patrón es el que explota la corrección de EXP08b.

| División | n | log-loss | Brier | RPS | ganancia vs base |
|---|---:|---:|---:|---:|---:|
| P1 | 3.535 | **0,9190** | 0,5424 | 0,1825 | **0,1519** |
| G1 | 2.883 | 0,9209 | 0,5458 | 0,1783 | 0,1437 |
| N1 | 3.591 | 0,9407 | 0,5580 | 0,1893 | 0,1259 |
| I2 | 4.982 | 1,0438 | 0,6297 | 0,2064 | 0,0414 |
| SP2 | 5.511 | 1,0382 | 0,6253 | 0,2077 | 0,0319 |
| D2 | 3.672 | **1,0494** | 0,6327 | 0,2160 | **0,0314** |

La horquilla de eficiencia es **5×**. Las segundas divisiones (D2, I2, SP2, F2) son las menos
eficientes y las de más empates (27,9–32,0 % frente a 23,5 % en E0): el mercado aporta menos donde
el resultado es más incierto; no falla, hay menos que saber. Por temporada europea (12 temporadas
comparables, n = 5.876–6.554) el log-loss va de 0,9771 (2023/24) a 1,0117 (2012/13); las peores
recientes son 2019/20 (1,0052; n = 5.876) y 2020/21 (0,9994; n = 6.183), las dos de la COVID. Las
etiquetas de año natural cubren otras ligas (0,9756–1,0399) y no son comparables entre sí. La
amplitud temporal europea (0,034 nats) es **cuarenta veces** la mayor diferencia entre de-vigs
(0,00087).

**Mercado vs Motor A, mismos partidos.** Δ = pérdida(Motor A) − pérdida(mercado); Δ > 0 ⇒ Motor A peor.
n = 93.624 emparejados (cobertura 100 %).

| Motor | Partición | n | mercado | Motor A | Δ log-loss | IC95 % | gana Motor A |
|---|---|---:|---:|---:|---|---:|---:|
| logit | dev | 85.476 | 0,9974 | 1,0134 | +0,0160 | +0,0147 a +0,0175 | 46,5 % |
| logit | val | 8.148 | 0,9898 | 1,0086 | +0,0188 | +0,0149 a +0,0232 | 44,2 % |
| hgb | dev | 85.476 | 0,9974 | 1,0161 | +0,0188 | +0,0173 a +0,0205 | 47,3 % |
| hgb | val | 8.148 | 0,9898 | 1,0073 | +0,0174 | +0,0120 a +0,0225 | 46,4 % |

Pierde en **23/23 divisiones** y **4/4 bandas**, con IC excluyendo el cero en todas. Más cerca en D1
(+0,0089; n = 3.671), N1 (+0,0106; n = 3.591) e I2 (+0,0127; n = 4.982); más lejos en G1 (+0,0306;
n = 2.883), I1 (+0,0234; n = 4.558) y SWE (+0,0225; n = 2.900). Por bandas: de +0,0156 (muy abierto,
n = 11.625) a +0,0180 (favorito claro, n = 28.663) con logit.

**Mezclas.** Con `p = w·p_mercado + (1−w)·p_MotorA`, el óptimo en `dev` es w = 1,00 (logit) y 0,90
(HGB): el log-loss cae de 1,0134 (w = 0) a 0,9974 (w = 1). En `val`, w = 0,90 da 0,98978 frente a
0,98984 del mercado puro, Δ = −0,00006 (IC95 % −0,00062 a +0,00047), **indistinguible de cero**. Que
el Motor A, sin ver cuotas, no aporte nada *por encima* del cierre es la evidencia más fuerte de
eficiencia.

## 5. EXP13 — Movimiento de cuotas (escenario *closing-line*)

> **Limitación estructural.** La fuente no publica timestamps: la apertura se supone disponible
> antes del día del partido y el cierre es la última cuota previa al inicio. Para observar el cierre
> hay que esperar al cierre: **no se puede simular una predicción hecha con antelación y ninguna
> cifra de esta sección es un backtest operable.**

Población: apertura y cierre Pinnacle válidos, n = 68.157 (dev 62.380 + val 5.777). Solo ligas
europeas (Pinnacle no abre en ARG/BRA/MEX/USA/JPN/SWE), así que su log-loss absoluto no es
comparable con EXP07 (0,9910 aquí frente a 0,9967 en la población completa).

**Magnitud.** L1 (suma de |Δlog p|): media 0,192; mediana 0,153; p90 0,383; p99 0,718. Por
resultado: visitante 0,084, local 0,064, empate 0,044. El 89 % de los partidos se mueve más de 0,05
y el 37 % más de 0,20; creció de 0,176 (2012/13) a 0,220 (2021/22) y se estabilizó en ~0,199.

**Dirección.** El movimiento medio de la probabilidad del resultado que finalmente ocurrió es
+0,0033, frente a −0,0059 de los que no ocurrieron; el 53,1 % de los ganadores tenían al cierre más
probabilidad que en la apertura. Movimiento medio del local: +0,0015 si gana H, −0,0050 si empata,
−0,0137 si gana A. La señal apunta en la dirección correcta pero es débil.

**Apertura vs cierre** (mismos 68.157 partidos): log-loss 0,99425 vs **0,99097**; Brier 0,59393 vs
0,59179; RPS 0,20088 vs 0,19989. Δ = +0,00319 (IC95 % +0,00251 a +0,00389) en `dev` y +0,00431
(+0,00238 a +0,00621) en `val`: **el cierre es más afilado**. El efecto se concentra donde el mercado
se mueve: en el decil de mayor movimiento (L1 > 0,383, n = 6.816) el cierre mejora 0,01562 nats; en
el resto (n = 61.341), 0,00191. **Ocho veces más**, lo esperable si el movimiento informa.

**¿Aporta algo más allá del cierre? No.** Logística multinomial sobre `log p_cierre` (3 features)
frente a `log p_cierre` + movimiento (6 features), ajustada en `dev` y evaluada en `val` (n = 5.777):
0,97526 vs 0,97554. Δ = +0,00029 (IC95 % +0,00001 a +0,00059) en log-loss, +0,00011 (IC −0,00002 a
+0,00026) en Brier y +0,00002 en RPS: el movimiento **empeora** ligeramente porque el cierre ya lo
incorpora. Frente al de-vig crudo tampoco gana (0,97554 vs 0,97580; Δ = −0,00026, IC −0,00076 a
+0,00025). Informativo respecto de la apertura, **redundante respecto del cierre**: diagnóstico de
eficiencia, no *feature* operable.

## 6. Recomendación para Motor B

**De-vig *power* + corrección calibrada opcional. No un clasificador con cuotas.** Evidencia en `val`
(n = 8.148, escenario de cierre):

| Modelo | Parámetros | log-loss | Brier | RPS | ECE | Δ vs de-vig (IC95 %) |
|---|---:|---:|---:|---:|---:|---|
| M0 de-vig power | 0 | 0,98984 | 0,59096 | 0,19890 | 0,0079 | — |
| M1 temperatura (T = 0,9843) | 1 | 0,98975 | 0,59092 | 0,19888 | 0,0074 | −0,00009 (−0,00021 a +0,00002) |
| M2 logística sobre log p | 12 | **0,98930** | **0,59063** | **0,19882** | 0,0074 | −0,00054 (−0,00090 a −0,00017) |
| M3 logística + margen | 13 | 0,98930 | 0,59063 | 0,19882 | 0,0070 | −0,00054 (−0,00089 a −0,00017) |
| M4 HGB (log p + margen) | ~10²–10³ | 0,99035 | 0,59147 | 0,19912 | 0,0093 | +0,00051 (−0,00097 a +0,00184) |
| M5 Motor A logit | — | 1,00863 | 0,60359 | 0,20463 | 0,0130 | +0,01879 |

* **M4 es peor que el de-vig** por sobreajuste (0,98168 en `dev` frente a 0,99035 en `val`): confirma
  a Sallis et al. (2026). **M2 gana** −0,00054 con IC excluyendo el cero, pero **no es estable**:
  walk-forward en `dev` = +0,00026 (2019), +0,00017 (2020), −0,00006 (2021), −0,00006 (2022); dos de
  cuatro temporadas empeora y la media en `dev` es ≈ +0,00008, así que la ganancia de `val` es en
  parte suerte de una temporada. **M3 = M2**: el margen no añade nada. M2 aprende sobre todo a **subir
  el empate** +0,27 pp (+0,75 pp en partidos muy abiertos, −0,34 pp en favoritos claros), coherente
  con el §4.

**Especificación.** (1) **Núcleo:** de-vig *power* sobre la mejor fuente disponible al predecir; en
producción, **apertura** (Pinnacle si existe, si no Bet365), no cierre —power también gana en
apertura Bet365 (n = 125.299; Δ = +0,00087; 20/22 temporadas) y las columnas `mkt_open_*_power_*` ya
están en el parquet—. (2) **Calibración opcional:** logística multinomial de 12 parámetros sobre
`log p`, solo si el walk-forward la valida con signo consistente; ganancia esperada ≈ 0 a −0,0005
nats, fuera del caso base. (3) **Prohibido como camino principal:** HGB/GBM sobre cuotas en crudo.
(4) **No mezclar con el Motor A** (w = 1,0 / 0,9; mejora no significativa). (5) **Batir al de-vig no
es batir al precio**: el margen (2,8 % en cierre Pinnacle, 6,2 % en Bet365) sigue ahí y nada de este
informe implica valor esperado positivo contra la casa.

## 7. Limitaciones

1. **Sin timestamps**: apertura y cierre son escenarios distintos; todo lo que usa cierre es
   benchmark, no estrategia.
2. **`val` es una temporada** (8.148 con Pinnacle; 5.777 en EXP13): los IC son honestos, pero no fija
   diferencias de 0,0005.
3. **Bajo n = 500 no se concluye**; temporada×división de ligas de 20 equipos (~380) queda fuera.
4. **La comparación con Motor A le favorece** (sus hiperparámetros se eligieron con `val`) y aun así
   pierde. **Solo 1X2**: sin hándicaps ni `totals`.

## 8. Reproducibilidad

```bash
cd research/prediction-lab
./.venv/bin/python models/b/analysis/run_all.py     # 93 s, 19/19 artefactos, semilla 20261109
```

Artefactos por experimento: `exp08a_devig.json` (+ `_by_season`, `_by_division`, `_bootstrap`,
`_reliability`, `_margin`), `exp07_market_efficiency.json` (+ `exp07_fav_bands`,
`exp07_efficiency_division`, `exp07_efficiency_season`), `exp08b_odds_classifier.json` (+
`exp08b_comparisons.csv`), `exp13_movement.json` (+ `exp13_magnitude_by_season`,
`exp13_direction_quintiles`) y un `*_tables.md` cada uno. El bootstrap reproduce
`eval.compare.paired_bootstrap_delta` y se autocomprueba en cada ejecución; las métricas vienen de
`eval.metrics` (ln natural, RPS H < D < A, factor 1/2), comparables con EXP01.
