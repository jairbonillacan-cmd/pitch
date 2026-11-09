# Mezcla de v2 con ratings del historial largo

> Generado por `pnpm --filter @pitchlab/ingest backtest:blend` · 2026-11-09T04:48:50.662Z

**Método.** Walk-forward semanal sobre `data/history` (6 ligas). v2 es el modelo publicado hoy: Dixon-Coles con la temporada en curso y la anterior a peso 0.45. La mezcla promedia su 1X2 con el de ratings incrementales (todas las temporadas disponibles, predicción antes de actualizar) y reescala la matriz de marcadores para que el resto de mercados siga siendo coherente.

El peso se fijó en **0.5** antes de esta prueba (validación temporal 2010-2019 → 2020-2026 en el benchmark histórico). Aquí se vuelve a elegir en validación (2019-20, 2020-21, 2021-22, 2022-23) y se reporta en prueba (2023-24, 2024-25, 2025-26, 2026-27).

## Validación: log loss 1X2 por peso

| Peso ratings | n | Log loss | ECE | Acierto |
|---|---|---|---|---|
| 0 | 7726 | 1.0003 | 1.4 % | 51.4 % |
| 0.3 | 7726 | 0.9971 | 1.1 % | 51.7 % |
| 0.4 | 7726 | 0.9966 | 1.2 % | 51.9 % |
| 0.5 | 7726 | 0.9964 | 1.4 % | 52.0 % |
| 0.6 | 7726 | 0.9965 | 1.5 % | 52.0 % |
| 0.7 | 7726 | 0.9968 | 1.6 % | 52.0 % |

Ratings solas: 0.9996. Peso con menor log loss en validación: **0.5**.

## Prueba (fuera de muestra)

| Peso ratings | n | Log loss | ECE | Acierto |
|---|---|---|---|---|
| 0 (v2 actual) | 5529 | 0.9797 | 0.7 % | 53.8 % |
| 0.3 | 5529 | 0.9763 | 0.6 % | 53.7 % |
| 0.4 | 5529 | 0.9757 | 0.9 % | 54.0 % |
| 0.5 | 5529 | 0.9754 | 0.9 % | 54.1 % |
| 0.6 | 5529 | 0.9754 | 1.4 % | 54.1 % |
| 0.7 | 5529 | 0.9756 | 1.7 % | 54.0 % |

Ratings solas: 0.9780.

Δ log loss (mezcla 0.5 − v2): **-0.0043**, IC 95 % [-0.0067, -0.0021]. Negativo = la mezcla pierde menos.

### Por liga (prueba)

| Liga | n | v2 | Mezcla 0.5 | Δ | IC 95 % | ECE v2 | ECE mezcla |
|---|---|---|---|---|---|---|---|
| premier-league | 1150 | 0.9763 | 0.9741 | -0.0022 | [-0.0071, 0.0026] | 3.2 % | 1.4 % |
| laliga | 1170 | 0.9697 | 0.9643 | -0.0054 | [-0.0094, -0.0012] | 3.0 % | 2.9 % |
| bundesliga | 931 | 0.9890 | 0.9831 | -0.0059 | [-0.0112, -0.0008] | 2.4 % | 3.5 % |
| serie-a | 1137 | 0.9741 | 0.9709 | -0.0031 | [-0.0086, 0.0021] | 3.1 % | 1.7 % |
| ligue-1 | 930 | 0.9941 | 0.9890 | -0.0051 | [-0.0102, -0.0003] | 2.5 % | 2.1 % |
| liga-mx | 211 | 0.9791 | 0.9741 | -0.0049 | [-0.0208, 0.0106] | 3.9 % | 3.7 % |

Peso elegido en validación aplicado a prueba (0.5): log loss 0.9754.

## Índice de confianza

Umbrales: Alta ≥ 62, Media ≥ 45. Percentiles 30/70 del índice en validación: 47 / 67.

| Nivel (prueba) | Partidos | % del total | Acierto del favorito | Log loss 1X2 | Acierto del pick destacado |
|---|---|---|---|---|---|
| alta | 2184 | 39.5 % | 64.3 % | 0.8701 | 63.3 % |
| media | 2103 | 38.0 % | 48.1 % | 1.0354 | 66.3 % |
| baja | 1242 | 22.5 % | 46.2 % | 1.0589 | 67.0 % |

## Picks por perfil

| Perfil | Muestra | Partidos con pick | Probabilidad media | Acierto real | Cuota justa media |
|---|---|---|---|---|---|
| conservadora | validación (n=7726) | 100.0 % | 83.3 % | 80.1 % | 1.20 |
| intermedia | validación (n=7700) | 99.7 % | 65.8 % | 65.3 % | 1.53 |
| arriesgada | validación (n=7710) | 99.8 % | 48.1 % | 47.6 % | 2.09 |
| conservadora | prueba (n=5529) | 100.0 % | 83.7 % | 82.4 % | 1.20 |
| intermedia | prueba (n=5516) | 99.8 % | 65.9 % | 65.2 % | 1.52 |
| arriesgada | prueba (n=5505) | 99.6 % | 48.0 % | 49.0 % | 2.09 |

Un perfil está bien calibrado si su acierto real se parece a su probabilidad media.
