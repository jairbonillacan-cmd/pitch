# Benchmark histórico walk-forward

Generado: 2026-11-09T01:47:24.129Z

Ventana móvil de entrenamiento: 1095 días. Cada jornada se predice solo con partidos anteriores a su fecha.

> Evaluación retro: **no** cuenta como track record (PREDICTION_ARCHITECTURE.md §2).

## Fútbol: Dixon-Coles, Elo y mezcla

| Liga | Temporadas | n | Dixon-Coles | Elo | Mezcla 50/50 | Ingenuo | Mercado | Δ DC−mercado | Δ mezcla−mercado |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| premier-league | 17 | 6098 | 0.9771 | 0.9766 | 0.9744 | 1.0656 | 0.9594 | 0.0177 [0.0131, 0.0221] | 0.0150 [0.0108, 0.0189] |
| la-liga | 15 | 5359 | 0.9728 | 0.9721 | 0.9703 | 1.0624 | 0.9525 | 0.0203 [0.0152, 0.0256] | 0.0178 [0.0132, 0.0226] |
| bundesliga | 17 | 4917 | 0.9982 | 0.9970 | 0.9957 | 1.0674 | 0.9812 | 0.0170 [0.0122, 0.0218] | 0.0144 [0.0099, 0.0190] |
| serie-a | 14 | 4944 | 0.9735 | 0.9730 | 0.9707 | 1.0759 | 0.9489 | 0.0246 [0.0199, 0.0292] | 0.0218 [0.0174, 0.0264] |
| ligue-1 | 13 | 4254 | 1.0021 | 1.0009 | 0.9993 | 1.0691 | 0.9820 | 0.0201 [0.0147, 0.0259] | 0.0173 [0.0124, 0.0226] |
| liga-mx | 4 | 982 | 1.0050 | 1.0030 | 1.0020 | 1.0571 | — | — | — |

Mercado sin vig: 25,572 predicciones emparejadas. Cuota de cierre en 94.6% de los casos; el resto es cuota pre-partido (temporadas antiguas).

> Las cuotas vienen de football-data.co.uk y son **research-only**; no se publican.

### Elo y mezcla frente a Dixon-Coles

| Liga | Δ Elo−DC | Δ mezcla−DC |
|---|---:|---:|
| premier-league | -0.0005 [-0.0040, 0.0030] | -0.0027 [-0.0045, -0.0010] |
| la-liga | -0.0007 [-0.0045, 0.0027] | -0.0025 [-0.0044, -0.0008] |
| bundesliga | -0.0011 [-0.0047, 0.0023] | -0.0025 [-0.0043, -0.0008] |
| serie-a | -0.0005 [-0.0043, 0.0033] | -0.0027 [-0.0046, -0.0009] |
| ligue-1 | -0.0012 [-0.0051, 0.0027] | -0.0028 [-0.0047, -0.0009] |
| liga-mx | -0.0020 [-0.0101, 0.0055] | -0.0030 [-0.0071, 0.0010] |

Δ negativo = Elo/mezcla pierden menos que Dixon-Coles.

### Totales (más/menos 2.5) frente al mercado

| Liga | n | LogLoss modelo | LogLoss mercado |
|---|---:|---:|---:|
| premier-league | 2667 | 0.6830 | 0.6732 |
| la-liga | 2695 | 0.6904 | 0.6672 |
| bundesliga | 2112 | 0.6621 | 0.6438 |
| serie-a | 2664 | 0.6915 | 0.6796 |
| ligue-1 | 2348 | 0.6916 | 0.6706 |

Entrenamiento ampliado: 34,669 partidos research-only anteriores al corpus (1993-94 en adelante) se usan solo para ajustar; la evaluación sigue sobre el corpus publicable.

> Esos resultados vienen de football-data.co.uk y son research-only: no se publican.

## NFL (ratings ridge)

| Métrica | n | Modelo | Ingenuo |
|---|---:|---:|---:|
| LogLoss moneyline | 7204 | 0.6545 | 0.6860 |
| Brier moneyline | 7204 | 0.4624 | 0.4929 |
| Acierto | 7204 | 61.6% | 56.2% |
| LogLoss totales en la línea de cierre | 7204 | 0.7155 | 0.7229 |

Δ LogLoss moneyline frente al ingenuo: **-0.0315**, IC 95% [-0.0389, -0.0237].

Mercado sin vig (moneylines de cierre de nflverse), 5426 partidos: LogLoss 0.6106, Brier 0.4231.

Δ LogLoss frente al mercado: **0.0421**, IC 95% [0.0344, 0.0499].

> Las líneas de cierre de nflverse se usan **solo para investigación interna** (CC-BY 4.0; no se publican como cuotas propias).

## Notas metodológicas

- Evaluación retro walk-forward: cada jornada se predice con datos anteriores a su fecha.
- El modelo de fútbol es Dixon-Coles con decaimiento temporal; se compara con un Elo incremental y una mezcla 50/50. El de NFL, ratings ridge con localía.
- La referencia ingenua usa las tasas base de la ventana de entrenamiento.
- El benchmark público entrena solo con el corpus versionado; --include-research-history añade 1993-2010 (research-only) sin cambiar la evaluación.
- El mercado de fútbol usa cuotas sin vig de football-data.co.uk (research-only); el de NFL, moneylines de cierre de nflverse.
- Un Δ logLoss negativo significa que el modelo pierde menos que la referencia.
- Un Δ negativo significa que el modelo pierde menos que la referencia; si el IC 95 % cruza el 0, la diferencia no es concluyente.
