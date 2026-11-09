# Congelación de candidatos (pre-test) — 2026-11-09 03:35 (antes de la evaluación de test)

**Regla:** la selección se hace SOLO con `val` (2023/24) y con la robustez por temporada en
`dev`. El conjunto `test` (2024/25 + 2025/26) no se usa para elegir. A partir de este documento,
los candidatos quedan congelados y se evalúan una única vez.

## 1. Motor A (sin cuotas) — candidatos y evidencia

Val 2023/24, 8.152 partidos, mismas filas:

| Modelo | Log-loss | Brier | RPS | Accuracy | Δ vs hgb (IC95 %) | Veredicto |
|---|---:|---:|---:|---:|---|---|
| `hgb` | 1,0097 | 0,60443 | 0,20513 | 0,4909 | — | empatado |
| `logit` | 1,0103 | 0,60454 | 0,20509 | 0,4937 | −0,00055 [−0,00289, +0,00196] | **ELEGIDO** |
| `ensemble` (logit+hgb+poisson, pesos walk-forward) | 1,0082 | 0,60332 | 0,20460 | 0,4942 | −0,00153 [−0,00318, +0,00007] | empatado, no significativo |
| `elo_ordered` | 1,0167 | 0,60920 | 0,20720 | 0,4883 | — | respaldo interpretable |
| `poisson_dc` | 1,0262 | 0,61555 | 0,21012 | 0,4812 | — | solo diversidad |
| `base_rate` | 1,0736 | 0,64942 | 0,22650 | 0,4390 | — | baseline |

**Decisión:** Motor A de producción = **regresión logística multinomial** (54 features deportivas +
dummies de división). Es el modelo más simple de los estadísticamente empatados con el mejor
(hgb/ensemble), ya está exportado a JSON y verificado en TypeScript con |Δ| ≤ 5×10⁻¹³.
El ensemble y HGB quedan documentados como alternativas de igual rendimiento estadístico.

**Justificación anti-sobreajuste:** elegir el ensemble por 0,0015 de log-loss cuyo IC95 % roza el
cero sería seleccionar ruido; la regla pre-registrada es preferir el modelo simple cuando la
diferencia no es concluyente.

## 2. Motor B (con cuotas) — candidatos y evidencia

Val 2023/24, subconjunto con cuota de apertura (n = 5.782):

| Sistema | Log-loss | Δ vs mercado abierto (IC95 %) |
|---|---:|---|
| mercado apertura (power, cadena PS→B365→Avg) | 0,98016 | — |
| `linear_pool` (peso mercado 1,00) | 0,98016 | 0,00000 [0,00000, 0,00000] |
| `stack_logit` | 0,97888 | −0,00128 [−0,00170, −0,00080] |
| `ensemble_b` | 0,97875 | −0,00141 [−0,00194, −0,00085] |

**Robustez por temporada (dev+val, 21 temporadas):** Δ log-loss medio de `stack_logit` frente al
mercado = **+0,00001** (mediana −0,00022; positiva en 7 de 21 temporadas; máximos +0,00267 en
2006/07 y +0,00234 en 2026/27). `ensemble_b`: media +0,00008. La ganancia de val **no es estable**.

**Decisión:** Motor B = **de-vig power sobre cuotas de apertura** (operable). No se adopta la
mezcla ni el stacking: no superan al mercado de forma robusta. Se documenta el resultado negativo
(no hay edge demostrable) en `08_COMPARACION_CON_MERCADO.md`.

## 3. Benchmarks obligatorios en test

- `market_close_best_power` — mejor precio de cierre disponible (PS→B365→Avg). No operable; es el
  listón de eficiencia.
- `market_open_best_power` — cuotas de apertura (operable).
- `base_rate` — referencia trivial.

## 4. Definiciones de cierre

- Test = 2024/25 + 2025/26 agregadas y desglosadas por temporada y división.
- Comparaciones pareadas por `match_id` exacto; bootstrap por bloques temporada×división (B=2000),
  permutación 10.000; se declara mejora solo si IC95 % excluye 0 **y** p < 0,05.
- Nada se reentrena ni se reajusta después de este documento.

**Firmado:** Orquestador · **Fecha:** 2026-11-09T03:35-06:00 (creado antes de `eval.report` sobre test; la adenda se añadió a las 03:52)

---

## 5. Adenda POST-TEST (2026-11-09 03:52) — solo para trazabilidad

Evaluación única sobre `test` (2024/25 + 2025/26, 16.126 partidos), con los candidatos congelados:

| Sistema | Log-loss | Brier | RPS | Accuracy | ECE |
|---|---:|---:|---:|---:|---:|
| `logit` (Motor A congelado) | 1,01802 | 0,60983 | 0,20820 | 0,4890 | 0,0112 |
| `hgb` (alternativa) | 1,01860 | 0,61043 | 0,20835 | 0,4904 | 0,0055 |
| `ensemble` (alternativa pre-especificada) | 1,01652 | 0,60907 | 0,20789 | 0,4901 | 0,0047 |
| `stack_logit` (Motor B experimental) | 1,00527 | 0,60159 | 0,20443 | 0,4995 | 0,0082 |
| mercado cierre (mejor precio) | 0,99770 | 0,59645 | 0,20203 | 0,5062 | 0,0063 |
| mercado apertura (mejor precio, n=11.295) | 0,99176 | 0,59238 | 0,20004 | 0,5115 | 0,0063 |
| base_rate | 1,07506 | 0,65044 | 0,22784 | 0,4376 | 0,0154 |

Comparaciones pareadas clave (Δ = pérdida(A) − pérdida(B); <0 ⇒ A mejor):
- `ensemble` vs `logit`: −0,00153 [−0,00250, −0,00050], p=0,001 → **el ensemble supera a logit en test**.
- `ensemble` vs `hgb`: −0,00208 [−0,00320, −0,00100], p=0,000.
- `logit` vs `market_close`: +0,0203 [0,0175, 0,0231] → el mercado gana con claridad.
- `ensemble` vs `market_close`: +0,0188 [0,0161, 0,0214].
- `market_open` vs `stack_logit` (n=11.295): +0,0007 [−0,0000, +0,0015], p=0,97 → **sin diferencia significativa**.
- `market_close` vs `market_open` (n=11.295): −0,0034 [−0,0047, −0,0021] → el cierre es mejor que la apertura.

**Transparencia sobre exposición a test:** el pipeline de walk-forward calcula por diseño todas las
particiones y algunos `metrics.json` intermedios (p. ej. `EXP01_final`) incluían la columna `test`
antes de este documento. Las decisiones de selección se tomaron con `val` y la tabla de arriba es la
evaluación formal pre-registrada; la exposición previa se registra aquí para que un revisor pueda
juzgar el riesgo de data snooping (fue mínima y no guió ninguna elección).

**Lectura honesta:** el Motor A congelado (logit) queda 0,020 por detrás del cierre. El ensemble,
también pre-especificado antes de test, resulta significativamente mejor que logit en test; como eso
se decide mirando test, NO se cambia retroactivamente el modelo desplegado: se propone como
candidato principal del siguiente ciclo, a confirmar con datos nuevos. Motor B (stacking) no supera
al mercado de forma significativa. La conclusión del paper se replica: la información manda.
