# ADR-005: Gráficas: visx como base y uPlot para series largas

- **Estado:** Aceptada
- **Fecha:** 2026-11-08

## Contexto

Las gráficas deben seguir la marca (modelo sólido en Índigo claro y serie observada discontinua en Eco), ser accesibles (resumen textual y tabla) y rendir bien en móvil.

## Decisión

`packages/charts` con componentes sobre visx (SVG, control total): HitRateBars, DistributionHistogram, TrendChart, CalibrationPlot y ComparisonChart. `LineMovementChart` usa uPlot (canvas) cuando hay más de ~5k puntos. Toda gráfica expone un `summary` textual y una tabla accesible.

## Alternativas descartadas

Recharts o Nivo (estética impuesta y difícil de ajustar a la marca); ECharts (peso); Chart.js (accesibilidad limitada).

## Consecuencias

Más código propio por gráfica, compensado por un set pequeño y reutilizable.
