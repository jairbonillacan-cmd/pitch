# 08 — Comparación con el mercado

**Documento:** Motor A vs mercado vs Motor B, con las cifras finales de validación y del cierre único de test.
**Fecha:** 2026-11-09 · **Autor:** SUBAGENTE 11 — DOCUMENTATION & REPRODUCIBILITY · **Commit:** `a680a4f`.
**Fuentes:** [`A07_market_intelligence.md`](../../research/prediction-lab/reports/A07_market_intelligence.md) · [`FREEZE.md`](../../research/prediction-lab/artifacts/FREEZE.md) · [`FINAL/eval_test/metrics.md`](../../research/prediction-lab/artifacts/FINAL/eval_test/metrics.md) · [`A06`](../../research/prediction-lab/reports/A06_motor_a_experiments.md).
**Convención:** Δ = pérdida(A) − pérdida(B); **Δ < 0 ⇒ A mejor**. IC95 % bootstrap por bloques temporada×división (B=2000); p de permutación (10.000).

---

## 1. Conclusión en tres frases

1. **El mercado gana con claridad:** el Motor A congelado (`logit`) queda **0,0203** por detrás del cierre (16.126 partidos) y **0,0170** por detrás de la apertura (11.295, mismos partidos); el mejor Motor A (ensemble) recorta a **0,0188** frente al cierre y sigue perdiendo.
2. **El de-vig *power* es el mejor precio estimado**, pero su ventaja sobre la normalización simple es de **0,000238** de log-loss: real, minúscula y relevante para el precio (ECE 0,0091 → 0,0055), no para batir al mercado.
3. **No hay *edge* demostrable:** el *stacking* de Motor B gana 0,00128 en val pero **+0,00001** de media por temporada y en test queda **+0,0007 [−0,0000, +0,0015], p=0,97** frente a la apertura. La conclusión del paper se replica: manda la información, no el algoritmo.

---

## 2. Poblaciones y cobertura

| Población | Fase | Fuente | Temporadas | n | Margen medio | Papel |
|---|---|---|---|---:|---:|---|
| `close_ps` | cierre | Pinnacle | 2012/13–2023/24 | 93.624 | 2,81 % | referencia de eficiencia (no operable) |
| `close_b365` | cierre | Bet365 | 2019/20–2023/24 | 28.589 | 6,15 % | contraste |
| `open_b365` | apertura | Bet365 | 2002/03–2023/24 | 125.299 | 7,44 % | robustez (operable) |
| `open_ps` | apertura | Pinnacle | 2012/13–2023/24 | 68.171 | 2,96 % | robustez (operable) |
| **test cierre** | cierre | mejor precio PS→B365→Avg | 2024/25–2025/26 | **16.126** | — | listón final |
| **test apertura** | apertura | mejor precio PS→B365→Avg | 2024/25–2025/26 | **11.295** | — | escenario operable |

**Cobertura en test:** el cierre cubre **16.126/16.126 (100 %)** — Pinnacle 12.506, B365 3.619, Avg 1 —; la apertura cubre **11.295/16.126 = 70,0 %** — Pinnacle 7.988, B365 3.294, Avg 13; 4.831 sin ninguna. Las seis ligas de año natural (ARG, BRA, JPN, MEX, SWE, USA) **no tienen apertura** en football-data: cuando falta, el Motor B cae al Motor A. Comparar sobre universos distintos es el error más fácil de cometer: todas las comparaciones de §5–§8 se hacen sobre la **intersección** de `match_id`.

---

## 3. Test (2024/25 + 2025/26): tabla completa

| Sistema | n | Log-loss | Brier | RPS | Accuracy | ECE |
|---|---:|---:|---:|---:|---:|---:|
| `base_rate` | 16.126 | 1,07506 | 0,65044 | 0,22784 | 0,4376 | 0,0154 |
| `logit` (Motor A congelado) | 16.126 | 1,01802 | 0,60983 | 0,20820 | 0,4890 | 0,0112 |
| `hgb` | 16.126 | 1,01860 | 0,61043 | 0,20835 | 0,4904 | 0,0055 |
| `ensemble` (logit+hgb+poisson, pesos WF) | 16.126 | **1,01652** | **0,60907** | **0,20789** | 0,4901 | **0,0047** |
| `stack_logit` (Motor B experimental) | 16.126 | 1,00527 | 0,60159 | 0,20443 | 0,4995 | 0,0082 |
| `market_close_best_power` | 16.126 | **0,99770** | **0,59645** | **0,20203** | **0,5062** | 0,0063 |
| `market_open_best_power` | 11.295 | 0,99176 | 0,59238 | 0,20004 | 0,5115 | 0,0063 |

**Lectura:** el ensemble es el mejor Motor A en las tres reglas propias (log-loss, Brier, RPS) y el mejor calibrado (ECE 0,0047), pero **ningún** sistema sin cuotas baja de 1,016. El mercado, en su subconjunto más favorable, baja a 0,99176.

### 3.1 Comparación manzana con manzana (n = 11.295)

Recalculado por A11 sobre `artifacts/FINAL/predictions_test.csv`, restringido a los partidos con cuota de apertura (mismo `match_id` para todos):

| Sistema | Log-loss | Δ vs apertura | Δ vs cierre |
|---|---:|---:|---:|
| `base_rate` | 1,07681 | +0,08505 | +0,08847 |
| `ensemble` | 1,00707 | +0,01531 | +0,01873 |
| `logit` | 1,00879 | +0,01703 | +0,02045 |
| `hgb` | 1,00934 | +0,01758 | +0,02100 |
| `stack_logit` | 0,99101 | **−0,00075** | +0,00267 |
| **`market_open_best_power`** | 0,99176 | — | +0,00342 |
| **`market_close_best_power`** | **0,98834** | **−0,00342** | — |

El *stack* adelanta a la apertura 0,00075 en esta muestra, pero **no** de forma significativa (§8) y **no** al cierre.

---

## 4. Validación (2023/24, 8.152): lo que se congeló

| Sistema | Log-loss | Brier | RPS | Accuracy | Δ vs hgb |
|---|---:|---:|---:|---:|---|
| mercado cierre PS (power) | 0,9898 | — | — | — | −0,0199 |
| `ensemble` | **1,00821** | 0,60332 | 0,20460 | 0,4942 | −0,00153 [−0,00318, +0,00007] |
| `hgb` | 1,00974 | 0,60443 | 0,20513 | 0,4909 | — |
| `logit` | 1,01029 | 0,60454 | 0,20509 | 0,4937 | +0,00055 [−0,00196, +0,00289] |
| `elo_ordered` | 1,01666 | 0,60920 | 0,20720 | 0,4883 | — |
| `poisson_dc` | 1,02621 | 0,61555 | 0,21012 | 0,4812 | — |
| `base_rate` | 1,07365 | 0,64942 | 0,22650 | 0,4390 | — |
| mercado apertura (subconjunto n=5.782) | 0,98016 | — | — | — | — |

**Decisión de congelación:** `logit` desplegado (simple, empatado con el mejor), `ensemble` documentado como alternativa, Motor B = de-vig sobre apertura. Ver [`FREEZE.md`](../../research/prediction-lab/artifacts/FREEZE.md).

---

## 5. Comparaciones pareadas de test

| A vs B | N | Δ log-loss [IC95 %] | p | ¿Significativo? | Mejor |
|---|---:|---|---:|---|---|
| `ensemble` vs `logit` | 16.126 | **−0,00153** [−0,00250, −0,00050] | 0,001 | sí | ensemble |
| `ensemble` vs `hgb` | 16.126 | **−0,00208** [−0,00320, −0,00100] | 0,000 | sí | ensemble |
| `hgb` vs `logit` | 16.126 | +0,0006 [−0,0011, +0,0024] | 0,733 | **no** | — |
| `logit` vs `market_close` | 16.126 | **+0,0203** [0,0175, 0,0231] | 0,0001 | sí | mercado |
| `ensemble` vs `market_close` | 16.126 | **+0,0188** [0,0161, 0,0214] | 0,0001 | sí | mercado |
| `ensemble` vs `market_open` (n=11.295) | 11.295 | +0,0153 [0,0128, 0,0175] | 0,0001 | sí | mercado |
| `market_open` vs `stack_logit` (n=11.295) | 11.295 | +0,0007 [−0,0000, +0,0015] | 0,97 | **no** | — |
| `market_close` vs `market_open` (n=11.295) | 11.295 | **−0,0034** [−0,0047, −0,0021] | 0,0001 | sí | cierre |

**Cómo leerlo:** el mercado gana al Motor A por 0,0188–0,0203 con IC que no toca el cero; el *stack* no se distingue de la apertura (p=0,97) y el cierre es mejor que la apertura por 0,0034. La diferencia entre logit y hgb es indistinguible (p=0,733), lo que justifica desplegar el más simple.

---

## 6. ¿Qué método de de-vig es mejor?

### 6.1 Comparación de métodos (A07)

| Población | Proporcional | **Power** | Shin | n |
|---|---:|---:|---:|---:|
| cierre Pinnacle | 0,99694 | **0,99670** | 0,99675 | 93.624 |
| cierre Bet365 | 0,99213 | **0,99163** | — | 28.589 |
| apertura Bet365 | 0,99735 | **0,99649** | — | 125.299 |
| apertura Pinnacle | 0,99448 | **0,99423** | — | 68.171 |

Δ(power − proporcional) en cierre Pinnacle: **+0,000238** [+0,000130, +0,000348]; power gana 17/24 temporadas (p=0,064) y 17/23 divisiones (p=0,0026). En apertura Bet365 gana 20/22 temporadas (p=1,1×10⁻⁵). **Cuatro poblaciones, IC que excluye el cero en todas, gradiente monótono con el margen** (de −0,00027 a −0,00179 entre Q1 y Q4): no es ruido, pero su tamaño es 0,02–0,09 % del log-loss.

### 6.2 Lo que sí cambia: calibración

| Banda de p | n observado | Brecha proporcional | Brecha power |
|---|---:|---:|---:|
| < 0,10 | 7.935 | **−0,0155** | **−0,0063** |
| 0,10–0,20 | 33.351 | −0,0055 | −0,0013 |
| 0,20–0,30 | 105.132 | −0,0040 | −0,0016 |
| 0,40–0,50 | 34.192 | +0,0067 | +0,0042 |
| ≥ 0,60 | 19.274 | **+0,0184** | **+0,0063** |

Proporcional reproduce el sesgo favorito-longshot de manual (infravalora favoritos 1,84 pp, sobrevalora *longshots* 1,55 pp); power reduce ambas brechas **~60–65 %** (ECE 0,0091 → **0,0055**; en apertura Bet365, 0,0115 → 0,0035) y lleva la pendiente de 1,058–1,098 a 0,992–1,019. **Para producir precios, power; para batir al mercado, ninguno.**

---

## 7. Eficiencia del mercado

- **Calibración:** ECE 0,0055 (dev 0,0057; val 0,0079), pendiente 1,019 (val 1,044). El mercado está **muy bien calibrado**, con residuo pequeño y sistemático: favoritos infravalorados **+0,63 pp** y *longshots* sobrevalorados **−0,63 pp**.
- **Empate:** infravalorado en todos los tramos de favoritismo salvo en favoritos claros (**+0,55 a +1,02 pp**). Es el único sesgo explotable en teoría; en test no se tradujo en ventaja (EXP10).
- **Por división:** horquilla de **5×** en log-loss — P1 **0,9190** (n=3.535) vs D2 **1,0494** (n=3.672); ganancia frente a la tasa base de 0,152 a 0,031. Las segundas divisiones son las menos eficientes y las que más empates tienen (27,9–32,0 % vs 23,5 % en E0): no falla el mercado, hay menos que saber.
- **Por temporada (europea):** 0,9771 (2023/24) a 1,0117 (2012/13); las peores recientes son 2019/20 (1,0052) y 2020/21 (0,9994), las dos de la COVID. La amplitud temporal (**0,034 nats**) es **cuarenta veces** la mayor diferencia entre métodos de de-vig (0,00087).
- **Ventaja sobre la tasa base:** **0,0751 nats**. Ese es el listón que cualquier modelo debe recorrer antes de mirar el margen.

---

## 8. Cierre vs apertura (y por qué no hay CLV)

| Comparación | Δ log-loss | IC95 % | Lectura |
|---|---:|---|---|
| cierre vs apertura (test, n=11.295) | **−0,0034** | [−0,0047, −0,0021] | el cierre es más afilado |
| cierre vs apertura (dev, A07) | +0,00319 | [+0,00251, +0,00389] | ídem |
| cierre vs apertura (val, A07) | +0,00431 | [+0,00238, +0,00621] | ídem |
| movimiento **más allá** del cierre | +0,00029 | [+0,00001, +0,00059] | el movimiento **empeora**: el cierre ya lo incorpora |

Magnitud del movimiento: L1 medio **0,192** (mediana 0,153; p90 0,383); el 89 % de los partidos se mueve más de 0,05. El efecto del cierre se concentra donde el mercado se mueve: en el decil de mayor movimiento mejora **0,01562** nats frente a **0,00191** en el resto (**8×**).

**Advertencia estructural:** football-data **no publica timestamp**. La apertura se supone disponible antes del día del partido y el cierre es la última cuota previa al inicio. Para observar el cierre hay que esperar al cierre: **no se puede simular una predicción hecha con antelación y ninguna cifra de esta sección es un backtest operable**. Sin timestamps no hay CLV: ver [`11_LIMITACIONES_Y_RIESGOS.md`](11_LIMITACIONES_Y_RIESGOS.md) y [`10_ROADMAP_PREDICCIONES.md`](10_ROADMAP_PREDICCIONES.md).

---

## 9. Motor B: por qué no se adopta el *stacking*

| Sistema | Val (n=5.782) | Δ vs apertura | Test (n=11.295) | Δ vs apertura |
|---|---:|---:|---:|---:|
| mercado apertura | 0,98016 | — | 0,99176 | — |
| `linear_pool` (peso 1,00) | 0,98016 | 0,00000 | — | — |
| `stack_logit` | 0,97888 | −0,00128 [−0,00170, −0,00080] | 0,99101 | **−0,00075** (+0,0007 como apertura−stack, p=0,97) |
| `ensemble_b` | 0,97875 | −0,00141 [−0,00194, −0,00085] | — | — |

**Robustez:** por temporada (dev+val, 21), el Δ medio de `stack_logit` frente al mercado es **+0,00001** (mediana −0,00022; positiva en 7/21; máximos +0,00267 en 2006/07 y +0,00234 en 2026/27). La ganancia de val **no es estable** y en test no alcanza significación. **Decisión:** Motor B = de-vig *power* sobre apertura; el *stacking* se documenta como resultado negativo, no se despliega.

**Clasificador con cuotas:** peor que el de-vig por sobreajuste (HGB 0,99035 vs 0,98984 en val; 0,98168 en dev). Confirma a Sallis et al. (2026): meter cuotas como *features* no bate usarlas como precio.

> **Nota de lectura de los dos universos.** El `stack_logit` de `candidate_selection.json` vale **0,99668** sobre los 8.152 partidos de val (con *fallback* a Motor A donde no hay apertura); sobre los **5.782** con cuota de apertura vale **0,97888**, que es la cifra comparable con el mercado (0,98016). Mezclar ambas cifras es el error clásico: un modelo con *fallback* parece peor solo porque incluye partidos sin mercado.

---

## 10. ¿Qué haría falta para batir al mercado?

1. **Cerrar la brecha de información:** 0,0188–0,0203 de log-loss es ~12–13 veces la mejora del ensemble sobre logit (0,00153). No se cierra con otro clasificador.
2. **Superar el margen:** 2,81 % (Pinnacle cierre) y 6,15 % (B365 cierre). Batir al de-vig **no** es batir al precio.
3. **Producir señal propia:** xG con licencia, snapshots de cuotas con hora, alineaciones/lesiones y modelos por competición. Nada de eso existe hoy con cobertura suficiente.
4. **Demostrarlo con el protocolo:** Δ < 0 con IC que excluya 0 en **test nuevo**, no en val ni en un subconjunto elegido después.

---

## 11. Decisión final

| Pregunta | Respuesta |
|---|---|
| ¿Bate el Motor A al mercado? | **No.** Pierde por 0,0188 (ensemble) a 0,0203 (logit) con IC que excluye 0. |
| ¿Bate el Motor B al mercado? | **No de forma robusta.** Val −0,00128 no replicado (media +0,00001 por temporada); test +0,0007, p=0,97. |
| ¿Qué se despliega? | Motor A `logit`; Motor B de-vig *power* sobre apertura como precio/benchmark. |
| ¿Hay *edge*? | **No demostrable.** La conclusión del paper se replica: manda la información. |
| ¿Qué queda como candidato? | El `ensemble` (mejor log-loss y ECE en test) para el siguiente ciclo, con datos nuevos. |

## 7. Confirmación prospectiva (ciclo 6)

En 146 fixtures reales del 6–9 nov 2026, predichos por el pipeline completo y puntuados con
resultados publicados después, el mercado volvió a ganar: 0,91407 vs 0,93943 de log-loss
(Δ +0,02536 [+0,00585; +0,04434]). Es la tercera muestra independiente (val, test, fixtures) con el
mismo signo. La comparación no es en tiempo real (predicciones tras el kickoff), pero el modelo
nunca vio esos partidos.
