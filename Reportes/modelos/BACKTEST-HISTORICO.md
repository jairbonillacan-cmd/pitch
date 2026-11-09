# Benchmark histórico walk-forward

Generado: 2026-11-09T05:30:51.381Z

Ventana móvil de entrenamiento: 1095 días. Cada jornada se predice solo con partidos anteriores a su fecha.

> Evaluación retro: **no** cuenta como track record (PREDICTION_ARCHITECTURE.md §2).

## Fútbol: Dixon-Coles, Elo (goles y xG), mezclas y stacking

| Liga | n | Dixon-Coles | Elo | Elo-xG | Mezcla | Mezcla-xG | Stack | Mercado | Δ DC−mercado | Δ mezcla−mercado | Δ mezcla-xG−mercado |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| premier-league | 5898 | 0.9748 | 0.9754 | 0.9754 | 0.9726 | 0.9726 | — | 0.9563 | 0.0185 [0.0142, 0.0233] | 0.0163 [0.0122, 0.0206] | 0.0163 [0.0122, 0.0206] |
| la-liga | 5159 | 0.9752 | 0.9750 | 0.9750 | 0.9727 | 0.9727 | — | 0.9527 | 0.0224 [0.0173, 0.0276] | 0.0200 [0.0152, 0.0250] | 0.0200 [0.0152, 0.0250] |
| bundesliga | 4710 | 0.9951 | 0.9948 | 0.9948 | 0.9928 | 0.9928 | — | 0.9776 | 0.0175 [0.0124, 0.0228] | 0.0152 [0.0104, 0.0201] | 0.0152 [0.0104, 0.0201] |
| serie-a | 4744 | 0.9737 | 0.9765 | 0.9765 | 0.9725 | 0.9725 | — | 0.9500 | 0.0237 [0.0190, 0.0289] | 0.0225 [0.0181, 0.0276] | 0.0225 [0.0181, 0.0276] |
| ligue-1 | 4054 | 1.0034 | 1.0034 | 1.0034 | 1.0009 | 1.0009 | — | 0.9813 | 0.0221 [0.0158, 0.0281] | 0.0197 [0.0140, 0.0251] | 0.0197 [0.0140, 0.0251] |
| liga-mx | 781 | 1.0043 | 1.0068 | 1.0068 | 1.0030 | 1.0030 | — | — | — | — | — |

Mercado sin vig: 24,565 predicciones emparejadas. Cuota de cierre en 96.1% de los casos; el resto es cuota pre-partido (temporadas antiguas).

> Las cuotas vienen de football-data.co.uk y son **research-only**; no se publican.

### Elo, mezcla y stacking frente a Dixon-Coles

| Liga | Δ Elo−DC | Δ Elo-xG−DC | Δ mezcla−DC | Δ mezcla-xG−DC | Δ stack−DC |
|---|---:|---:|---:|---:|---:|
| premier-league | 0.0007 [-0.0031, 0.0043] | 0.0007 [-0.0031, 0.0043] | -0.0022 [-0.0040, -0.0003] | -0.0022 [-0.0040, -0.0003] | — |
| la-liga | -0.0002 [-0.0041, 0.0036] | -0.0002 [-0.0041, 0.0036] | -0.0025 [-0.0044, -0.0005] | -0.0025 [-0.0044, -0.0005] | — |
| bundesliga | -0.0003 [-0.0041, 0.0036] | -0.0003 [-0.0041, 0.0036] | -0.0023 [-0.0043, -0.0003] | -0.0023 [-0.0043, -0.0003] | — |
| serie-a | 0.0028 [-0.0011, 0.0068] | 0.0028 [-0.0011, 0.0068] | -0.0012 [-0.0031, 0.0008] | -0.0012 [-0.0031, 0.0008] | — |
| ligue-1 | 0.0001 [-0.0043, 0.0042] | 0.0001 [-0.0043, 0.0042] | -0.0024 [-0.0045, -0.0003] | -0.0024 [-0.0045, -0.0003] | — |
| liga-mx | 0.0025 [-0.0074, 0.0126] | 0.0025 [-0.0074, 0.0126] | -0.0013 [-0.0064, 0.0040] | -0.0013 [-0.0064, 0.0040] | — |

Δ negativo = el candidato pierde menos que Dixon-Coles.

### Mezcla con DC-xG (goles + xG) y Elo-xG

| Liga | Mezcla-xG | Mezcla DC-xG | Δ vs mezcla-xG | Mercado | Δ mezcla DC-xG − mercado |
|---|---:|---:|---:|---:|---:|
| premier-league | 0.9726 | 0.9726 | 0.0000 [0.0000, 0.0000] | 0.9563 | 0.0163 [0.0122, 0.0206] |
| la-liga | 0.9727 | 0.9727 | 0.0000 [0.0000, 0.0000] | 0.9527 | 0.0200 [0.0152, 0.0250] |
| bundesliga | 0.9928 | 0.9928 | 0.0000 [0.0000, 0.0000] | 0.9776 | 0.0152 [0.0104, 0.0201] |
| serie-a | 0.9725 | 0.9725 | 0.0000 [0.0000, 0.0000] | 0.9500 | 0.0225 [0.0181, 0.0276] |
| ligue-1 | 1.0009 | 1.0009 | 0.0000 [0.0000, 0.0000] | 0.9813 | 0.0197 [0.0140, 0.0251] |
| liga-mx | 1.0030 | 1.0030 | 0.0000 [0.0000, 0.0000] | — | — |

### Totales (más/menos 2.5) frente al mercado

| Liga | n | LogLoss modelo | LogLoss xG | LogLoss mercado |
|---|---:|---:|---:|---:|
| premier-league | 2667 | 0.6826 | — | 0.6732 |
| la-liga | 2695 | 0.6902 | — | 0.6672 |
| bundesliga | 2112 | 0.6612 | — | 0.6438 |
| serie-a | 2664 | 0.6905 | — | 0.6796 |
| ligue-1 | 2348 | 0.6914 | — | 0.6706 |

## NFL (ratings ridge)

| Métrica | n | Modelo | Ingenuo |
|---|---:|---:|---:|
| LogLoss moneyline | 7204 | 0.6545 | 0.6860 |
| Brier moneyline | 7204 | 0.4623 | 0.4929 |
| Acierto | 7204 | 61.7% | 56.2% |
| LogLoss totales en la línea de cierre | 7204 | 0.7155 | 0.7229 |
| LogLoss totales calibrados (Platt) | 7204 | 0.6949 | 0.7229 |

Δ LogLoss moneyline frente al ingenuo: **-0.0315**, IC 95% [-0.0390, -0.0237].

Calibración de totales: pendiente **0.047**, intercepto -0.052. Una pendiente cercana a 0 indica que la probabilidad de over del modelo apenas aporta información sobre la línea.

Mercado sin vig (moneylines de cierre de nflverse), 5426 partidos: LogLoss 0.6106, Brier 0.4231.

Δ LogLoss frente al mercado: **0.0421**, IC 95% [0.0344, 0.0499].

> Las líneas de cierre de nflverse se usan **solo para investigación interna** (CC-BY 4.0; no se publican como cuotas propias).

## Notas metodológicas

- Evaluación retro walk-forward: cada jornada se predice con datos anteriores a su fecha.
- El modelo de fútbol es Dixon-Coles con decaimiento temporal; se compara con un Elo incremental, una mezcla 50/50 y un stacking logístico con features as-of (descanso, forma y tiros a puerta). El de NFL, ratings ridge con localía.
- La referencia ingenua usa las tasas base de la ventana de entrenamiento.
- El benchmark público entrena solo con el corpus versionado; --include-research-history añade 1993-2010 (research-only) sin cambiar la evaluación.
- El mercado de fútbol usa cuotas sin vig de football-data.co.uk (research-only); el de NFL, moneylines de cierre de nflverse.
- Un Δ logLoss negativo significa que el modelo pierde menos que la referencia.
- Un Δ negativo significa que el modelo pierde menos que la referencia; si el IC 95 % cruza el 0, la diferencia no es concluyente.
