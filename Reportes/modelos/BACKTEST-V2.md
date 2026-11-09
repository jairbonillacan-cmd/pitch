# Backtest walk-forward de los modelos v2

Generado: 2026-11-09T01:56:39.457Z

## Premier League

| Modelo | n | LogLoss 1X2 | Brier 1X2 | LogLoss O/U 2.5 | LogLoss BTTS | Acierto | ECE |
|---|---:|---:|---:|---:|---:|---:|---:|
| v2 | 327 | 1.0217 | 0.6130 | 0.7013 | 0.6669 | 49.2% | 0.0486 |
| Baseline 0 | 327 | 1.0239 | 0.6145 | 0.6959 | 0.6658 | 48.3% | 0.0293 |
| Ingenuo | 327 | 1.0741 | 0.6493 | 0.6781 | 0.6831 | 45.0% | 0.0481 |

Δ logLoss (v2 − Baseline 0): **-0.0022**, IC 95% [-0.0190, 0.0150].

## NFL

| Modelo | n | LogLoss ML | Brier ML | LogLoss Total | Acierto | ECE |
|---|---:|---:|---:|---:|---:|---:|
| v2 | 310 | 0.6468 | 0.4568 | 0.6881 | 63.9% | 0.0632 |
| Baseline 0 | 310 | 0.6413 | 0.4513 | 0.6928 | 60.3% | 0.0333 |
| Ingenuo | 310 | 0.6998 | 0.5066 | 0.7024 | 48.4% | 0.0582 |

Δ logLoss (v2 − Baseline 0): **0.0055**, IC 95% [-0.0079, 0.0202].

> Menor es mejor. Un Δ negativo significa que v2 pierde menos que el Baseline 0.
