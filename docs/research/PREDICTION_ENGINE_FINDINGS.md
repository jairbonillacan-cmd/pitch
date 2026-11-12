# Hallazgos sobre motores predictivos

> **Propósito:** qué se aprendió de los motores de las referencias y cómo condiciona el diseño del motor propio.
> **Consumidores:** `PREDICTION_ARCHITECTURE.md` (F3), owner de `services/models` y Model Lab.
> **Fecha:** 2026-11-08

## 1. Motores observados

| Motor | Deporte | Cadena | Parámetros clave | Etiqueta | Fuente |
|---|---|---|---|---|---|
| TouchIQ NFL | NFL | Pitágoras (E=2.37) → Log5 → HFA odds-ratio (0.55; 0.50 en Londres) → margen normal μ=13.4·Φ⁻¹(p), totales con σ=13.3 | Pick 80/20 con contracción SHR | RECONSTRUIDO, Δ=0 en 14 juegos × 15 mercados | `Reportes/18-engine-nfl-report.md` |
| TouchIQ NCAA | NCAA | Igual más factor de conferencia (0.88 G5) y SHR 0.85, σ=15.5 | | RECONSTRUIDO, Δ=0 en 32 juegos | `Reportes/19-engine-ncaa-report.md` |
| AztecaVet fútbol | 5 ligas | Shrinkage bayesiano (K=6) → Pitágoras E=1.7 → Log5 (HFA 0.54) → tilt por bisección → Poisson 15×15 con Dixon-Coles (ρ −0.14 MX / −0.08 EU) | 18 mercados | RECONSTRUIDO (324 tests) | `Reportes/aztecavet/football-engine.md` |
| AztecaVet NHL | NHL | Pitágoras E=2.15, K=15, forma 30 %, Poisson 22×22, OT redistribuido | 15 mercados | OBSERVADO | `Reportes/aztecavet/nhl-engine.md` |
| AztecaVet MLB | MLB | Normal SD=3√2, regresión de abridor a 80 IP | 6 mercados | OBSERVADO | `Reportes/aztecavet/mlb-engine.md` |
| LineMate | NFL y otros | **No hay motor predictivo**: hit rate = hits/n y promedio | — | OBSERVADO | `Reportes/analisis-linemate/hit-rate-engine.md`, `prediction-vs-trends.md` |

**Nota:** TouchIQ y AztecaVet comparten base de código (`ev_44e130e7`), así que en la práctica son **una sola familia de motores**, no dos evidencias independientes.

## 2. Debilidades comunes (por qué no basta copiarlos)

1. **Parámetros fijos sin estimación publicada** (E, HFA, SHR, ρ, σ). Se desconoce si fueron estimados o elegidos a mano (DESCONOCIDO).
2. **Sin validación temporal.** La «auditoría» de AztecaVet usa ratings de noviembre para juegos de octubre (look-ahead, OBSERVADO).
3. **Umbrales arbitrarios** (EV ≥ 4 %, sizing del 5/10 %) sin justificación estadística.
4. **Frecuencia presentada como probabilidad** (LineMate, «100 % Club»).
5. **Independencia asumida** en las combinadas.

## 3. Consecuencias de diseño para PitchLab

| Decisión | Detalle |
|---|---|
| **Baseline 0** | Los motores reconstruidos (`src/domain` → `packages/engines-reference`) se ejecutan en el mismo backtest que los modelos propios. Ningún modelo se publica si no los supera. |
| **Benchmark de mercado** | La probabilidad sin vig de la cuota de cierre (consenso de las casas disponibles) es el segundo benchmark. Superar al mercado de forma consistente es raro: se reporta con honestidad. |
| **Métricas** | Brier, log loss, curva de calibración (ECE), CLV medio y error de proyección (MAE/CRPS en props). **El % de aciertos no es una métrica de publicación.** |
| **Validación** | Walk-forward por temporada y semana, con features construidas solo con `observedAt ≤ predictedAt` (test automático de leakage). |
| **Preregistro** | Cada versión candidata declara su ventana out-of-sample y sus métricas antes de evaluarse (registro en Postgres). |
| **Candidatos por deporte (orden)** | NFL: Elo con margen → regresión ordinal/normal de margen → GBM con features de cuotas. Fútbol: Dixon-Coles con MLE dinámico (time-decay) → Poisson bivariado con covariables. NHL: Poisson con ajuste de portero. MLB: modelo de carreras con abridor y bullpen. Props NFL: binomial negativa o distribuciones empíricas con shrinkage. |
| **UI de frecuencias** | Hit rate siempre con n, IC (Wilson), push rate y probabilidad implícita de la cuota al lado. Nunca «100 %» sin denominador. |
| **Sin recomendaciones** | La UI muestra probabilidad, cuota justa y diferencia frente al mercado como datos. No muestra «apuesta X» ni sizing. |
| **Predicciones inmutables** | `Prediction` con `modelVersion` e `inputsAsOf`. Nunca se reescriben (contrato del plan maestro §5). |

## 4. Abierto

- La profundidad histórica real de las cuotas de cierre por deporte depende del proveedor (FD-02). Sin ella, el CLV histórico se limita a los snapshots que PitchLab capture desde el día 1.
- La licencia para **entrenar modelos** con los datos del proveedor tiene que constar por escrito (`DATA_PROVIDER_MATRIX.md`).
