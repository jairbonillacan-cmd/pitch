# Congelación de candidatos (pre-test) — 2026-11-09 03:35 (antes de la evaluación de test)

> **Estructura del archivo (corrección post-auditoría A09c, 2026-11-09 04:45).** Este documento
> contiene únicamente el cuerpo **pre-test**. La adenda post-test se separó a
> `FREEZE_ADDENDUM_post_test.md` para que el freeze sea citable como artefacto previo. El archivo
> original se creó a las 03:35:07 y fue modificado a las 03:48:21 para añadir la adenda; la primera
> versión fechaba esa adenda a las 03:52, hora imposible frente al *mtime* (discrepancia D1 de A09c).
> El hash del cuerpo original no se conservó antes de la edición: eso queda como limitación
> documentada.

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

**Firmado:** Orquestador · **Fecha:** 2026-11-09T03:35-06:00 (creado antes de `eval.report` sobre test; ver *birth time* 03:35:07 en la auditoría A09c)
