# Backtest walk-forward de los modelos v2

Generado: 2026-11-09T00:25:40.630Z

## Premier League

| Modelo | n | LogLoss 1X2 | Brier 1X2 | LogLoss O/U 2.5 | LogLoss BTTS | Acierto |
|---|---:|---:|---:|---:|---:|---:|
| v2 | 327 | 1.0230 | 0.6139 | 0.7045 | 0.6677 | 51.1% |
| Baseline 0 | 327 | 1.0239 | 0.6145 | 0.6959 | 0.6658 | 48.3% |
| Ingenuo | 327 | 1.0741 | 0.6493 | 0.6781 | 0.6831 | 45.0% |

Δ logLoss (v2 − Baseline 0): **-0.0009**, IC 95% [-0.0225, 0.0207].

## NFL

| Modelo | n | LogLoss ML | Brier ML | LogLoss Total | Acierto |
|---|---:|---:|---:|---:|---:|
| v2 | 307 | 0.6479 | 0.4579 | 0.6880 | 63.8% |
| Baseline 0 | 307 | 0.6419 | 0.4519 | 0.6927 | 60.3% |
| Ingenuo | 307 | 0.6999 | 0.5066 | 0.7032 | 48.5% |

Δ logLoss (v2 − Baseline 0): **0.0060**, IC 95% [-0.0074, 0.0206].

> Menor es mejor. Un Δ negativo significa que v2 pierde menos que el Baseline 0.
