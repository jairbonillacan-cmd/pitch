# Benchmark histórico walk-forward

Generado: 2026-11-09T05:37:05.036Z

Ventana móvil de entrenamiento: 1095 días. Cada jornada se predice solo con partidos anteriores a su fecha.

> Evaluación retro: **no** cuenta como track record (PREDICTION_ARCHITECTURE.md §2).

## Fútbol: Dixon-Coles, Elo (goles y xG), mezclas y stacking

| Liga | n | Dixon-Coles | Elo | Elo-xG | Mezcla | Mezcla-xG | Stack | Mercado | Δ DC−mercado | Δ mezcla−mercado | Δ mezcla-xG−mercado |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| premier-league | 6098 | 0.9771 | 0.9766 | 0.9866 | 0.9744 | 0.9721 | — | 0.9594 | 0.0177 [0.0131, 0.0221] | 0.0150 [0.0108, 0.0189] | 0.0127 [0.0084, 0.0166] |
| la-liga | 5359 | 0.9728 | 0.9721 | 0.9759 | 0.9703 | 0.9670 | — | 0.9525 | 0.0203 [0.0152, 0.0256] | 0.0178 [0.0132, 0.0226] | 0.0145 [0.0098, 0.0190] |
| bundesliga | 4917 | 0.9982 | 0.9970 | 1.0005 | 0.9957 | 0.9928 | — | 0.9812 | 0.0170 [0.0122, 0.0218] | 0.0144 [0.0099, 0.0190] | 0.0116 [0.0073, 0.0162] |
| serie-a | 4944 | 0.9735 | 0.9730 | 0.9764 | 0.9707 | 0.9660 | — | 0.9489 | 0.0246 [0.0199, 0.0292] | 0.0218 [0.0174, 0.0264] | 0.0171 [0.0123, 0.0218] |
| ligue-1 | 4254 | 1.0021 | 1.0009 | 1.0099 | 0.9993 | 0.9987 | — | 0.9820 | 0.0201 [0.0147, 0.0259] | 0.0173 [0.0124, 0.0226] | 0.0167 [0.0118, 0.0217] |
| liga-mx | 982 | 1.0050 | 1.0030 | 1.0088 | 1.0020 | 1.0012 | — | — | — | — | — |

Mercado sin vig: 25,572 predicciones emparejadas. Cuota de cierre en 94.6% de los casos; el resto es cuota pre-partido (temporadas antiguas).

> Las cuotas vienen de football-data.co.uk y son **research-only**; no se publican.

### Elo, mezcla y stacking frente a Dixon-Coles

| Liga | Δ Elo−DC | Δ Elo-xG−DC | Δ mezcla−DC | Δ mezcla-xG−DC | Δ stack−DC |
|---|---:|---:|---:|---:|---:|
| premier-league | -0.0005 [-0.0040, 0.0030] | 0.0095 [0.0019, 0.0169] | -0.0027 [-0.0045, -0.0010] | -0.0050 [-0.0084, -0.0017] | — |
| la-liga | -0.0007 [-0.0045, 0.0027] | 0.0031 [-0.0036, 0.0099] | -0.0025 [-0.0044, -0.0008] | -0.0059 [-0.0088, -0.0029] | — |
| bundesliga | -0.0011 [-0.0047, 0.0023] | 0.0024 [-0.0042, 0.0092] | -0.0025 [-0.0043, -0.0008] | -0.0054 [-0.0084, -0.0024] | — |
| serie-a | -0.0005 [-0.0043, 0.0033] | 0.0029 [-0.0047, 0.0108] | -0.0027 [-0.0046, -0.0009] | -0.0075 [-0.0107, -0.0041] | — |
| ligue-1 | -0.0012 [-0.0051, 0.0027] | 0.0079 [0.0008, 0.0154] | -0.0028 [-0.0047, -0.0009] | -0.0034 [-0.0068, 0.0002] | — |
| liga-mx | -0.0020 [-0.0101, 0.0055] | 0.0038 [-0.0095, 0.0173] | -0.0030 [-0.0071, 0.0010] | -0.0038 [-0.0107, 0.0030] | — |

Δ negativo = el candidato pierde menos que Dixon-Coles.

### Mezcla con DC-xG (goles + xG) y Elo-xG

| Liga | Mezcla-xG | Mezcla DC-xG | Δ vs mezcla-xG | Mercado | Δ mezcla DC-xG − mercado |
|---|---:|---:|---:|---:|---:|
| premier-league | 0.9721 | 0.9722 | 0.0002 [0.0000, 0.0000] | 0.9594 | 0.0128 [0.0086, 0.0170] |
| la-liga | 0.9670 | 0.9658 | -0.0012 [0.0000, 0.0000] | 0.9525 | 0.0133 [0.0090, 0.0175] |
| bundesliga | 0.9928 | 0.9917 | -0.0011 [0.0000, 0.0000] | 0.9812 | 0.0105 [0.0062, 0.0149] |
| serie-a | 0.9660 | 0.9655 | -0.0004 [0.0000, 0.0000] | 0.9489 | 0.0167 [0.0123, 0.0213] |
| ligue-1 | 0.9987 | 0.9986 | -0.0001 [0.0000, 0.0000] | 0.9820 | 0.0166 [0.0120, 0.0213] |
| liga-mx | 1.0012 | 1.0033 | 0.0022 [0.0000, 0.0000] | — | — |

### Mezcla-xG con peso validado (0.7 DC / 0.3 Elo-xG)

| Liga | 0.5/0.5 | 0.7/0.3 | Mercado | Δ 0.7−0.5 | Δ 0.7−mercado |
|---|---:|---:|---:|---:|---:|
| premier-league | 0.9721 | 0.9721 | 0.9594 | 0.0000 | 0.0127 [0.0087, 0.0165] |
| la-liga | 0.9670 | 0.9678 | 0.9525 | 0.0008 | 0.0153 [0.0108, 0.0198] |
| bundesliga | 0.9928 | 0.9936 | 0.9812 | 0.0008 | 0.0124 [0.0081, 0.0169] |
| serie-a | 0.9660 | 0.9672 | 0.9489 | 0.0012 | 0.0183 [0.0138, 0.0227] |
| ligue-1 | 0.9987 | 0.9984 | 0.9820 | -0.0002 | 0.0165 [0.0116, 0.0215] |
| liga-mx | 1.0012 | 1.0013 | — | 0.0001 | — |

### Totales (más/menos 2.5) frente al mercado

| Liga | n | LogLoss modelo | LogLoss xG | LogLoss mercado |
|---|---:|---:|---:|---:|
| premier-league | 2667 | 0.6830 | 0.6835 | 0.6732 |
| la-liga | 2695 | 0.6904 | 0.7054 | 0.6672 |
| bundesliga | 2112 | 0.6621 | 0.6577 | 0.6438 |
| serie-a | 2664 | 0.6915 | 0.6917 | 0.6796 |
| ligue-1 | 2348 | 0.6916 | 0.6859 | 0.6706 |

Entrenamiento ampliado: 34,669 partidos research-only anteriores al corpus (1993-94 en adelante) se usan solo para ajustar; la evaluación sigue sobre el corpus publicable.

> Esos resultados vienen de football-data.co.uk y son research-only: no se publican.

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
