# Contrato de predicciones y métricas — v1.0

**Propietario del formato:** Orquestador · **Implementa:** A08 (métricas/eval), A06/A07 (modelos)

Este contrato fija cómo se escriben las predicciones y cómo se calculan las métricas, para que
todos los modelos sean comparables **sobre exactamente los mismos partidos**.

## 1. Archivo de predicciones

`artifacts/<exp_id>/predictions.csv`, una fila por (partido, modelo):

| Columna | Tipo | Obligatoria | Descripción |
|---|---|---|---|
| `match_id` | str | sí | Clave de `matches.parquet` |
| `div` | str | sí | División |
| `season` | str | sí | Temporada |
| `match_date` | date | sí | Fecha del partido |
| `model_id` | str | sí | Identificador estable (`elo_logistic_v1`, …) |
| `model_version` | str | sí | Versión semántica del artefacto |
| `p_home` | float | sí | P(gana local), ∈ [0,1] |
| `p_draw` | float | sí | P(empate) |
| `p_away` | float | sí | P(gana visitante) |
| `fold_id` | str | sí | `wf_2023`, `val_2023`, `test_2024`… |
| `generated_at` | str | sí | ISO-8601 UTC |
| `data_quality_flag` | str | sí | `ok` o motivo de degradación |

Reglas:
- `p_home + p_draw + p_away = 1 ± 1e-6`; sin NaN; sin filas duplicadas `(match_id, model_id)`.
- Ninguna predicción puede generarse con información posterior a `match_date` (ver contrato de datos).
- El conjunto de evaluación se define por `(fold_id)`; las comparaciones usan la **intersección
  exacta** de `match_id` con predicción válida en todos los sistemas comparados.

## 2. Etiqueta

`y = 0` (H), `1` (D), `2` (A). Se documenta la convención en cada script.

## 3. Métricas (definiciones exactas)

Sea `p_i = (p_iH, p_iD, p_iA)` y `y_i` la clase observada, `N` partidos.

- **Multiclass Log Loss** (logaritmo natural): `-(1/N) Σ log(p_i[y_i])`, con `p` recortada a
  `[1e-15, 1]` y renormalizada. Menor es mejor.
- **Multiclass Brier Score**: `(1/N) Σ Σ_k (p_ik - o_ik)^2`, con `o` one-hot. Rango [0,2].
  Se reporta también el Brier "por clase" (media de `(p_ik - o_ik)^2`).
- **Ranked Probability Score (RPS)** (orden H < D < A):
  `RPS = (1/N) Σ 1/(K-1) Σ_{k=1}^{K-1} (CDF_p(k) - CDF_o(k))^2`, `K=3`.
- **Accuracy** y **Balanced Accuracy** (media del recall por clase).
- **Per-class precision/recall/F1** con matriz de confusión 3×3.
- **Calibración**: bins de confianza (por defecto 10 bins iguales) sobre la probabilidad de la
  clase predicha; `ECE = Σ (n_b/N) |acc_b - conf_b|`. Se documenta que ECE depende del binning y
  del número de muestras; se reporta junto con la curva, nunca como única medida.
  Además, calibración **one-vs-rest** por clase (fiabilidad de `p_k`).
- **Intervalos de confianza**: bootstrap **pareado por bloques** (bloques = temporada×división,
  `B=2000`, semilla fija) sobre las diferencias de pérdida entre dos sistemas, no sobre cada
  sistema por separado. Se reporta IC95 % de la diferencia y el % de remuestras con diferencia > 0.
- **Significancia**: prueba de permutación pareada sobre diferencias de log-loss (10.000
  permutaciones, semilla fija) + IC bootstrap. No se declara superioridad si el IC cruza 0.
- **Robustez**: métricas por temporada, por división y por temporada×división; se exige que la
  mejora no dependa de una sola liga o temporada.

## 4. Particiones temporales canónicas

| Partición | Temporadas | Uso |
|---|---|---|
| `dev` | ≤ 2022/23 | entrenamiento, features, selección interna |
| `val` | 2023/24 | elección de candidato/hiperparámetros |
| `test` | 2024/25 y 2025/26 | evaluación final, **una sola vez** |
| `live` | 2026/27 (parcial) | monitorización; nunca test |

- Walk-forward: para cada temporada `S` en `dev`∪`val`, entrenar con todo lo anterior a `S` y
  predecir `S`. Expanding window por defecto; rolling (5 temporadas) como variante declarada.
- Nunca split aleatorio. Nunca usar `test` para elegir nada.

## 5. Artefactos por experimento

`artifacts/<exp_id>/`:
- `config.json` — datos, features, hiperparámetros, semilla, commit, fecha.
- `predictions.csv` — según §1.
- `metrics.json` — todas las métricas de §3, por partición y global.
- `README.md` — qué se probó, resultado, decisión (adoptar/descartar), limitaciones.
