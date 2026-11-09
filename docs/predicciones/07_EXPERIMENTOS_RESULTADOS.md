# 07 — Experimentos y resultados finales

**Documento:** los 17 experimentos del plan científico (EXP01–EXP17) con las cifras **finales** del ciclo, su veredicto y lo que se retiró.
**Fecha:** 2026-11-09 · **Autor:** SUBAGENTE 11 — DOCUMENTATION & REPRODUCIBILITY · **Commit:** `a680a4f`.
**Fuentes:** [`A06`](../../research/prediction-lab/reports/A06_motor_a_experiments.md) (v1.1) · [`A07`](../../research/prediction-lab/reports/A07_market_intelligence.md) · [`A08`](../../research/prediction-lab/reports/A08_backtesting_framework.md) · [`A05`](../../research/prediction-lab/reports/A05_features.md) · [`FREEZE.md`](../../research/prediction-lab/artifacts/FREEZE.md) · [`FINAL/eval_test/metrics.md`](../../research/prediction-lab/artifacts/FINAL/eval_test/metrics.md).

> **Regla de lectura.** `val` = 2023/24 (8.152) se usó para elegir; `test` = 2024/25 + 2025/26 (16.126) se evaluó **una sola vez** tras congelar. Toda comparación es pareada por `match_id`, con bootstrap por bloques temporada×división (B=2.000) y permutación (10.000); se declara mejora solo si el IC95 % excluye 0 **y** p < 0,05. Δ = pérdida(A) − pérdida(B): **Δ < 0 ⇒ A mejor**.

---

## 0. Balance del ciclo

| Estado | Experimentos | n |
|---|---|---:|
| Ejecutados con cifras finales | EXP01, EXP02, EXP03, EXP05, EXP06, EXP07, EXP08, EXP09, EXP10, EXP12, EXP13, EXP16, EXP17 | 13 |
| Parciales (evidencia de otra tarea) | EXP04 (ablación de tiros), EXP11 (ablación), EXP15 (hashes/config) | 3 |
| No ejecutados | EXP14 (drift con reentrenamiento anual) | 1 |

**Adoptados:** dataset/features v1.1 (EXP16), `logit` como Motor A (EXP05/EXP17), de-vig *power* como Motor B (EXP08/EXP13). **Rechazados:** calibración (EXP06), *draw blend*/umbral (EXP10), *stacking* (EXP08), Poisson como Motor A (EXP03), ensemble como producción inmediata (EXP09, se difiere), clasificador con cuotas (EXP07/EXP08).

---

## 1. Tabla maestra

| Exp | Pregunta | Evidencia final | Veredicto |
|---|---|---|---|
| **EXP01** | ¿Un baseline trivial basta? | `base_rate` val 1,07365 / test 1,07506; Brier 0,65044, RPS 0,22784, acc 0,4376 en test | **Referencia**, no modelo |
| **EXP02** | ¿Qué parámetros del Elo importan? | 96 configuraciones: mejor K=20, HFA=90, reg=0, MOV=on → val **1,01453** vs 1,01666 por defecto; Δ −0,0021 [−0,0037, −0,0007], 99,7 % a favor; K 0,0047 de amplitud; HFA **no identificable** (0,00014); reg 0→0,5 cuesta +0,0041 | **Aceptado:** usar Elo con reg=0 y MOV=on; HFA irrelevante |
| **EXP03** | ¿Poisson/DC bate al modelo de features? | Mejor Poisson/DC val **1,02621** vs 1,00974 de hgb; α pedida {0,1,1,10} degenerada (sd≈0,01); rejilla 0,003–0,03 necesaria. DC con ρ estimado (media **−0,043**, 87 % divisiones negativo) mejora **0,00084** [0,00022, 0,00141] sobre Poisson con los mismos λ | **Rechazado como Motor A**; DC se conserva para mercados de goles |
| **EXP04** | ¿Tiros/xG aportan sobre Elo+goles? | Tiros: −0,00133 de log-loss al quitarlos (IC [0,0008, 0,0019]); xG **no evaluable** (sin datos históricos con licencia) | **Parcial:** tiros sí, xG pendiente |
| **EXP05** | ¿Algún clasificador supera al aditivo? | val: hgb **1,00974**, logit 1,01029, elo 1,01666, poisson 1,02621; test: hgb 1,01860 vs logit 1,01802 → Δ +0,0006 [−0,0011, +0,0024], p=0,733 | **Empate**; se elige logit por simplicidad |
| **EXP06** | ¿Calibrar mejora el log-loss? | Con v1.1: hgb empeora con todos los métodos (Δ ≥ 0); logit+Dirichlet **1,00968** (Δ −0,00061, 90 % a favor, IC cruza 0); ECE top de logit 0,0182 → 0,0104; walk-forward −0,0004 a −0,0010 | **No adoptado:** mejora fiabilidad, no pérdida |
| **EXP07** | ¿Motor A bate al mercado? | val: +0,0188 (logit) y +0,0174 (HGB), pierde 23/23 divisiones y 4/4 bandas; test: logit vs cierre **+0,0203** [0,0175, 0,0231]; ensemble +0,0188 [0,0161, 0,0214] | **Rechazado:** el mercado gana siempre |
| **EXP08** | ¿Un Motor B bate al mercado? | de-vig *power* gana a proporcional en 4/4 poblaciones (Δ +0,000238 [0,000130, 0,000348], cierre Pinnacle n=93.624); HGB con cuotas 0,99035 vs 0,98984 de-vig; `stack_logit` val −0,00128 pero por temporada **+0,00001**; test vs apertura **+0,0007 [−0,0000, 0,0015], p=0,97** | **De-vig sí; stacking NO** (no robusto) |
| **EXP09** | ¿Un ensemble mejora al mejor individual? | Ensemble walk-forward (logit+hgb+poisson): val **1,00821**, test **1,01652**; vs logit test **−0,00153** [−0,00250, −0,00050], p=0,001; vs hgb **−0,00208** [−0,00320, −0,00100]; en val, vs hgb −0,00153 [−0,00318, +0,00007] (no concluyente) | **Mejor candidato**, no desplegado (decisión post-test) |
| **EXP10** | ¿Se puede explotar el empate? | P(D) ECE 0,0080 (media 0,2639 vs 0,2691); argmax predice empate 0,80 % (841/105.372) vs 26,62 % real; umbral Δacc +0,0002; blend 50/50 Δ −0,00004 [−0,00056, +0,00039]; replace −0,00067 | **Rechazado:** no aporta tras el fix |
| **EXP11** | ¿Qué bloque de features importa? | Ablación v1.0 (n=116.830): Elo 1,01927 → +forma 1,01578 → +priors causales 1,01536; sin tiros 1,01346; descanso/contexto +0,00003; `season_progress` 0,00000 | **Parcial** (falta re-medir en v1.1); conclusión cualitativa estable |
| **EXP12** | ¿El rendimiento se degrada por temporada? | Test por temporada: ensemble 1,0548 (2024) · **1,0002** (2024/25) · 1,0387 (2025) · 1,0119 (2025/26); logit 1,0569 · 1,0011 · 1,0392 · 1,0141; mercado cierre 1,0310 · 0,9808 · 1,0253 · 0,9936 | **Aceptado con matiz:** la variación es de **mezcla de ligas**, no drift del modelo |
| **EXP13** | ¿El movimiento de cuotas aporta? | Cierre mejora apertura +0,00319 (dev) y +0,00431 (val); el movimiento **no aporta** más allá del cierre (Δ +0,00029 [0,00001, 0,00059], empeora); L1 medio 0,192 | **Rechazado como feature**; solo diagnóstico |
| **EXP14** | ¿Reentrenar cada año bate al congelado? | **No ejecutado** (requiere ventana congelada y ≥2 ciclos) | **Pendiente** |
| **EXP15** | ¿Dos ejecuciones dan lo mismo? | `config.json` + hashes + semilla en cada artefacto; FINAL registra SHA-256 de predicciones y parquet; no se hizo doble ejecución bit a bit | **Parcial** |
| **EXP16** | ¿Hay fugas en el pipeline? | Priors S+1 corregidos (99,63 % S−1); viaje en el tiempo **0 diferencias en 198 columnas** (139.049 filas); shuffle = entropía (1,07495 vs H(π)=1,07407); corte por fecha añadido (34.261 filas futuras eliminadas) | **Ejecutado:** fugas localizadas y corregidas |
| **EXP17** | ¿El sistema final bate al baseline y no al mercado? | Test: ensemble 1,01652, logit 1,01802, base 1,07506, cierre **0,99770** | **Confirmado:** bate al baseline, **no** al mercado |

---

## 2. Detalle de los experimentos que cambian decisiones

### 2.1 EXP02 — Elo: qué parámetro importa

| Parámetro | Niveles (media de val log-loss) | Amplitud | Lectura |
|---|---|---:|---|
| K | 10: 1,01633 · 20: 1,01709 · 30: 1,01888 · 40: 1,02098 | 0,0047 | monótono; K pequeño mejor |
| HFA | 40: 1,01839 · 65: 1,01833 · 90: 1,01825 | **0,00014** | **no identificable** (constante absorbida por los umbrales) |
| Regresión | 0: 1,01647 · 0,2: 1,01763 · 0,33: 1,01861 · 0,5: 1,02058 | 0,0041 | monótono; **0 mejor** |
| MOV | off: 1,01899 · on: 1,01765 | 0,0013 | activarlo mejor |

Mejor configuración: **K=20, HFA=90, reg=0, MOV=on → 1,01453**; por continuidad se documenta HFA=65 (1,01454). La ganancia frente a la configuración por defecto es −0,00210 [−0,00366, −0,00068] (99,7 % de remuestras), y el ranking de dev coincide: no es una elección de val.

### 2.2 EXP03 — Goles: Dixon-Coles sí, Poisson como Motor A no

- La rejilla de `alpha` pedida {0,1, 1, 10} es **degenerada** en sklearn (la penalización se divide por `n_samples`): con α ≥ 0,1 el ataque/defensa se aplasta (sd ≈ 0,01) y el modelo cae a la frecuencia base. Hubo que extenderla a 0,003–0,03.
- Mejor Poisson/DC: **val 1,02621**, 0,0165 por detrás de hgb.
- **Dixon-Coles aporta:** ρ estimado (media −0,043; 87 % de divisiones negativo) mejora **0,00084** [0,00022, 0,00141] sobre Poisson con los mismos λ, 99,6 % de remuestras. Es evidencia de que la correlación de marcadores bajos existe; no basta para ser el motor principal.

### 2.3 EXP06 — Calibración: el resultado cambió al limpiar los datos

| Modelo | Sin calibrar | Mejor calibrador | Δ | IC95 % |
|---|---:|---:|---:|---|
| hgb | 1,00974 | — (todos empeoran) | ≥ 0 | — |
| logit | 1,01029 | Dirichlet 1,00968 | −0,00061 | cruza 0 |
| elo_ordered | 1,01666 | vector 1,01580 | −0,00085 | cruza 0 |

**Cambio clave:** en v1.0 (con leakage) hgb + Dirichlet “mejoraba” −0,00112; con v1.1 **empeora** (+0,00007). La calibración ya no tiene efecto sobre el log-loss del mejor modelo; sí mejora la fiabilidad (ECE top de logit 0,0182 → 0,0104). **Veredicto: no adoptar como capa por defecto.**

### 2.4 EXP10 — Empates: el sesgo de argmax no es un bug

- P(D) está razonablemente calibrada (ECE 0,0080; media 0,2639 vs 0,2691).
- `hgb` predice empate por argmax el **0,80 %** (841/105.372) frente al 26,62 % real; `logit` 0,85 %; `elo_ordered` y `base_rate`, 0,00 %.
- Un umbral sobre P(D) no mejora accuracy (Δ +0,0002); el blend 50/50 **no** mejora el log-loss (−0,00004 [−0,00056, +0,00039]) y reemplazar P(D) lo empeora (−0,00067).
- **Veredicto:** reportar P(X) calibrada; **prohibido** decidir empate por argmax; no explotar el sesgo.

### 2.5 EXP08 — Motor B: de-vig sí, stacking no

| Sistema (val 2023/24, apertura n=5.782) | Log-loss | Δ vs mercado |
|---|---:|---|
| mercado apertura (power) | 0,98016 | — |
| `linear_pool` (peso mercado 1,00) | 0,98016 | 0,00000 |
| `stack_logit` | 0,97888 | −0,00128 [−0,00170, −0,00080] |
| `ensemble_b` | 0,97875 | −0,00141 [−0,00194, −0,00085] |

La ganancia de val **no es robusta**: por temporada (dev+val, 21) el Δ medio de `stack_logit` es **+0,00001** (mediana −0,00022; positiva en 7/21; máximos +0,00267 en 2006/07). En test, frente a apertura: **+0,0007 [−0,0000, +0,0015], p=0,97** → sin diferencia. **Veredicto: Motor B = de-vig *power*, sin stacking.**

### 2.6 EXP09 — Ensemble: la única mejora real, pero decidida mirando test

| Sistema | Val | Test | Δ test vs logit |
|---|---:|---:|---|
| logit | 1,01029 | 1,01802 | — |
| hgb | 1,00974 | 1,01860 | +0,0006 (ns) |
| ensemble | **1,00821** | **1,01652** | **−0,00153** [−0,00250, −0,00050], p=0,001 |

En val, ensemble vs hgb no era concluyente (−0,00153 [−0,00318, +0,00007]); en test sí supera a logit. Como esa comparación se hizo **después** de congelar, **no se cambia el modelo desplegado**: el ensemble queda como candidato del siguiente ciclo, a confirmar con datos nuevos.

### 2.7 EXP17 — Cierre único de test

| Sistema | Log-loss | Brier | RPS | Accuracy | ECE |
|---|---:|---:|---:|---:|---:|
| base_rate | 1,07506 | 0,65044 | 0,22784 | 0,4376 | 0,0154 |
| logit (desplegado) | 1,01802 | 0,60983 | 0,20820 | 0,4890 | 0,0112 |
| hgb | 1,01860 | 0,61043 | 0,20835 | 0,4904 | 0,0055 |
| ensemble | **1,01652** | **0,60907** | **0,20789** | 0,4901 | **0,0047** |
| stack_logit (Motor B) | 1,00527 | 0,60159 | 0,20443 | 0,4995 | 0,0082 |
| mercado cierre (mejor precio) | **0,99770** | **0,59645** | **0,20203** | **0,5062** | 0,0063 |
| mercado apertura (n=11.295) | 0,99176 | 0,59238 | 0,20004 | 0,5115 | 0,0063 |

**Veredicto:** el sistema bate al baseline por 0,057 y pierde con el mercado por **0,0188** (ensemble) / **0,0203** (logit). No hay *edge* demostrable; la brecha es de información, no de algoritmo.

---

## 3. Retractaciones (lo que ya no se puede citar)

| Cifra retirada | Origen | Motivo | Cifra vigente |
|---|---|---|---|
| hgb val **1,00730** | A06 v1.0 | priors con leakage S+1 | **1,00974** |
| hgb + Dirichlet **1,00618** / −0,00112 | A06 v1.0 | la calibración “mejoraba” por el leakage | hgb+Dirichlet 1,00981 (+0,00007); logit+Dirichlet 1,00968 |
| Brier test 0,60283 / log-loss 1,00730 | A06 v1.0 | dataset anterior (181.268) | test 1,01860 / 0,61043 |
| «con cuotas empatan al bookmaker» | brief inicial | el paper muestra que son **peores** (Tabla 13) | ver [`02`](02_INVESTIGACION_CIENTIFICA.md) |
| `8/9`, `8/11`, `9/17` como validez | legacy | leakage MX/NHL | ver [`14`](14_AUDITORIA_ADVERSARIAL.md) |
| ensemble de A06 v1.0 (pesos 0,2 inválidos) | A09b C2 | NaN de Poisson → pesos = punto inicial | `make_ensemble.py` walk-forward, miembros logit/hgb/poisson |

**Regla:** cualquier número de A06/A07 anterior a las 03:20 del 2026-11-09 es **exploratorio** y no debe citarse sin la etiqueta de versión.

---

## 4. Lecciones del ciclo

1. **La limpieza de datos movió más que cualquier modelo:** corregir el leakage cambió hgb en +0,0024 y eliminó la ilusión de que la calibración aportaba.
2. **La selección honesta es incómoda:** el ensemble es mejor en test, pero se decidió antes y no se cambia; el coste de hacerlo bien es renunciar a 0,0015 de log-loss en el ciclo actual.
3. **El mercado es el listón real:** 0,020 de brecha, consistente en val, test, 23 divisiones y 4 bandas de favoritismo.
4. **Los empates y la calibración no son la palanca:** ni el sesgo de argmax ni el ECE se traducen en pérdida.
5. **El experimento que falta es el que más importa:** EXP14 (drift) y EXP04 (xG) requieren datos que aún no existen; el próximo ciclo debe producirlos antes de prometer mejoras.

---

## Addendum ciclo 2 — monitorización live 2026/27 (no es test)

Con el modelo congelado, `pipeline/monitoring_report.py` evalúa la temporada en curso (3.398
partidos, parcial). No se usa para elegir; sirve para detectar deriva:

| Sistema | Log-loss | Brier | RPS | Acc | ECE |
|---|---:|---:|---:|---:|---:|
| mercado cierre | 0,99591 | 0,59435 | 0,20379 | 0,5103 | 0,0095 |
| stack_logit | 1,01361 | 0,60629 | 0,20936 | 0,4997 | 0,0242 |
| ensemble | 1,01959 | 0,61066 | 0,21131 | 0,4894 | 0,0197 |
| hgb | 1,02005 | 0,61079 | 0,21147 | 0,4918 | 0,0097 |
| logit | 1,02659 | 0,61255 | 0,21197 | 0,4932 | 0,0094 |

El logit desplegado se degrada 0,016 respecto a su val; el ensemble, 0,011. El pre-registro
`PREREGISTRATION_CYCLE2.md` fija la decisión de promoción sobre la muestra prospectiva.
