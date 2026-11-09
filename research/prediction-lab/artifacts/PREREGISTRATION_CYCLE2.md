# Pre-registro — Ciclo 2: ¿promover el ensemble sobre logit?

**Fecha:** 2026-11-09 (America/Mexico_City) · **Autor:** Orquestador
**Estado:** congelado antes de observar los datos de evaluación prospectiva.

## 1. Contexto

- **Motor A desplegado (ciclo 1):** `logit` multinomial, elegido por simplicidad al estar
  estadísticamente empatado con el mejor en `val` (2023/24).
- **Evidencia posterior:** en `test` (16.126 partidos) el `ensemble` (logit + HGB + Poisson con
  pesos walk-forward) superó a `logit` en **−0,00153** de log-loss [−0,00250, −0,00050], p=0,001.
  Esa comparación se hizo *después* de congelar, así que **no puede usarse para cambiar el modelo
  desplegado**: sería seleccionar sobre test.
- **Monitorización live 2026/27 (3.398 partidos, parcial):** `logit` 1,02659 vs `ensemble` 1,01959
  vs `stack_logit` 1,01361 vs mercado cierre 0,99591. El `logit` es el que más se degrada.

## 2. Hipótesis

**H1:** el `ensemble` walk-forward (logit + HGB + Poisson) tendrá menor log-loss que `logit` en
partidos de 2026/27 **posteriores al 2026-11-09** y en la temporada 2027/28, sobre los mismos
partidos y con la misma información pre-partido.

**H0:** no habrá diferencia (Δ = 0) o el ensemble será peor.

## 3. Diseño pre-registrado

| Elemento | Definición |
|---|---|
| Unidad | partido de fútbol 1X2 con resultado |
| Muestra prospectiva | 2026/27 con `match_date > 2026-11-09` + 2027/28 completa (si se dispone de ella en el ciclo) |
| Sistemas | `logit` (desplegado) y `ensemble` (candidato), ambos congelados con los artefactos actuales |
| Métrica primaria | log-loss multiclase (natural) |
| Métricas secundarias | Brier multiclase, RPS, accuracy, ECE, calibración por clase |
| Comparación | pareada por `match_id`, bootstrap por bloques temporada×división, B=2000, semilla 20261109 |
| Regla de decisión | promover el ensemble **solo si** Δlog-loss < 0 con IC95 % que excluya 0 **y** p-permutación < 0,05 **y** sin empeorar ECE en más de 0,002 |
| Tamaño mínimo | 2.000 partidos prospectivos; si no se alcanza, no se decide (se amplía la muestra) |
| Prohibiciones | no reajustar hiperparámetros, no cambiar features, no re-elegir pesos con la muestra prospectiva, no mirar la muestra antes del cierre |

## 4. Pesos congelados

Los pesos del ensemble se ajustan por temporada con las temporadas anteriores (walk-forward). Para
la evaluación prospectiva se usará el artefacto `pred_ensemble.csv` ya generado; si se regenera,
debe hacerse con datos anteriores al 2026-11-09 y registrarse el hash.

## 5. Qué se registra y dónde

- Predicciones congeladas: `artifacts/EXP01_final_20261109/pred_ensemble.csv` y `pred_logit.csv`.
- Monitorización mensual: `pipeline/monitoring_report.py` → `artifacts/FINAL/monitoring_live.md`.
- Cierre: se evaluará una sola vez al alcanzar el tamaño mínimo, con `eval/report.py` y la misma
  regla de significancia; el resultado se documentará en `07_EXPERIMENTOS_RESULTADOS.md` y
  `09_MEJORAS_IMPLEMENTADAS.md`.

## 6. Por qué esto es distinto del cierre de test

El test de 2024/25+2025/26 ya está usado. Esta muestra prospectiva **no existía** cuando se
concibió el modelo y no se usará para ninguna otra decisión. Es el mecanismo correcto para
promover un modelo sin repetir el error de seleccionar sobre datos ya vistos.

**Firmado:** Orquestador · **SHA de referencia:** `2895324` (rama `prediction-lab`).
