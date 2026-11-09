# 12 · Plan de mejora del motor predictivo

> Orden por evidencia, no por sofisticación. Cada paso se promueve solo si supera el
> protocolo de `13-validation-protocol.md`. **Fecha:** 2026-11-08.

## 0. Punto de partida (verificado en `11-model-audit.md`)

- Modelo del corpus (DC/ridge) > ingenuo en las 7 ligas, IC95 concluyente.
- Modelo < mercado sin vig en NFL (+0.0421 de LogLoss): hay margen de mejora real y
  medible antes de hablar de «ventaja».

## 1. Backlog priorizado

| # | Mejora | Evidencia que busca | Costo | Riesgo |
|---|---|---|---|---|
| 1 | **Calibración** (Platt/isotónica por mercado y liga, ajustada sin tocar el holdout final) | Reducción directa de LogLoss/Brier sin cambiar el ranking | Bajo | Sobreajuste de calibración → validación por temporada |
| 2 | **Excluir `postseason` del entrenamiento** de fútbol (y evaluar la liguilla aparte si algún día se modela) | Alinea entrenamiento con distribución objetivo | Mínimo (filtro) | Ninguno |
| 3 | **ξ y ventana por liga** (rejilla pequeña de ξ por liga con walk-forward) | Cada liga tiene distinta estabilidad (Liga MX con liguilla y COVID vs PL estable) | Bajo | Elección sobre-ajustada → usar IC por temporada |
| 4 | **Splits local/visita** en ataque/defensa | La asimetría local/visita hoy es solo un multiplicador global | Medio | Más parámetros con pocos partidos (contracción ya existe) |
| 5 | **Elo de arrastre entre temporadas** como prior del DC para ascendidos/nuevos | Menor error en las primeras jornadas | Medio | Doble modelación del mismo efecto |
| 6 | **Ensemble con el mercado** cuando existan cuotas legales de fútbol (combinar señal estadística + consenso sin vig) | Es la vía realista de acercarse al mercado; medir Δ vs mercado puro | Medio (requiere The Odds API disciplinado) | Dependencia de cuotas para publicar |
| 7 | Stats de equipo/jugador cuando haya fuente con licencia (Nivel B/C) | Solo si los IC muestran mejora estable | Alto | Data leakage en reconstrucciones históricas — prohibido por `10-feature-engineering.md` |

**No-objetivos** (declarados): deep learning sin justificación, copulas SGP antes de
W5 (triage REA), y «mejorar» el modelo agregando variables que no pueden validarse
fuera de muestra.

## 2. Gate de promoción (qué debe pasar para que un cambio entre a producción)

1. Δ LogLoss vs el modelo vigente **y** vs Baseline 0 con IC95 que no cruce 0, evaluado
   por liga y por temporada en el harness walk-forward.
2. Sin regresión de calibración (curvas por decil) y sin empeorar ninguna liga.
3. Evaluación retro ≠ track record (`PREDICTION_ARCHITECTURE.md` §2): lo que pasa el
   gate se publica con etiqueta «modelo retro» hasta acumular registro en vivo.
4. El dataset con el que se evaluó queda citado por `datasetId`.

## 3. Registro de experimentos

Cada experimento agrega una fila en `Reportes/modelos/` con: fecha, `datasetId`,
hipótesis, resultado (métricas + IC), decisión adoptada/rechazada. El binario de la
verdad es el reporte JSON del benchmark (`backtest-historico.json`), regenerable con el
mismo comando.
