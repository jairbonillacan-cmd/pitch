# Monitorización en vivo — 2026/27 (parcial)

Generado: 2026-11-09T09:55:53+00:00 · partidos: **3,398**

> `live` no es test: sirve para vigilar calibración y deriva del modelo congelado.

| Modelo | n | Cobertura | Log-loss | Brier | RPS | Acc | ECE |
|---|---:|---:|---:|---:|---:|---:|---:|
| `market_open_best_power` | 1,604 | 47.2% | 0.98433 | 0.58601 | 0.20368 | 0.5231 | 0.0426 |
| `market_close_best_power` | 3,398 | 100.0% | 0.99591 | 0.59435 | 0.20379 | 0.5103 | 0.0095 |
| `stack_logit` | 3,398 | 100.0% | 1.01361 | 0.60629 | 0.20936 | 0.4997 | 0.0242 |
| `ensemble` | 3,398 | 100.0% | 1.01959 | 0.61066 | 0.21131 | 0.4894 | 0.0197 |
| `hgb` | 3,398 | 100.0% | 1.02005 | 0.61079 | 0.21147 | 0.4918 | 0.0097 |
| `logit` | 3,398 | 100.0% | 1.02659 | 0.61255 | 0.21197 | 0.4932 | 0.0094 |
| `base_rate` | 3,398 | 100.0% | 1.07273 | 0.64892 | 0.22990 | 0.4385 | 0.0167 |

## Comparaciones pareadas (bootstrap por bloques)

| A vs B | n | Δlog-loss | IC95 % | frac Δ>0 |
|---|---:|---:|---|---:|
| ensemble vs logit | 3398 | -0.00700 | [-0.01773, -0.00160] | 0.000 |
| logit vs market_close_best_power | 3398 | 0.03068 | [0.02152, 0.04398] | 1.000 |
| ensemble vs market_close_best_power | 3398 | 0.02368 | [0.01786, 0.02849] | 1.000 |
| stack_logit vs market_close_best_power | 3398 | 0.01769 | [0.01070, 0.02253] | 1.000 |

## `logit` por división (n ≥ 80)

| Div | n | Log-loss | Acc | ECE |
|---|---:|---:|---:|---:|
| USA | 495 | 1.05736 | 0.4848 | 0.0401 |
| ARG | 481 | 1.05363 | 0.4470 | 0.0269 |
| BRA | 338 | 0.99815 | 0.5148 | 0.0032 |
| SWE | 216 | 1.02810 | 0.4954 | 0.0105 |
| E1 | 168 | 1.06616 | 0.4524 | 0.0611 |
| MEX | 134 | 1.08705 | 0.4254 | 0.0750 |
| SP2 | 131 | 1.03610 | 0.4885 | 0.0516 |
| JPN | 130 | 0.99510 | 0.5308 | 0.1234 |
| SP1 | 109 | 0.93189 | 0.5413 | 0.0715 |
| I1 | 100 | 0.90648 | 0.5900 | 0.1515 |
| I2 | 100 | 1.08565 | 0.4500 | 0.0268 |
| F2 | 99 | 1.08843 | 0.3737 | 0.0802 |
| N1 | 99 | 1.00111 | 0.5152 | 0.0584 |
| B1 | 90 | 0.90198 | 0.6333 | 0.1296 |
| D2 | 90 | 1.07046 | 0.4222 | 0.0307 |
| E0 | 90 | 1.04303 | 0.4444 | 0.1014 |
| P1 | 90 | 0.93126 | 0.5667 | 0.0545 |
| T1 | 90 | 1.14293 | 0.5111 | 0.0275 |
| F1 | 81 | 0.97765 | 0.5679 | 0.0827 |

## Lectura
- Si el log-loss live se separa >0,02 del val histórico en el mismo modelo, revisar deriva.
- La cobertura de mercado en 2026/27 es parcial (Pinnacle ya no publica): el benchmark
  de mercado se calcula con la cadena PS→B365→Avg y se reporta su cobertura.
- Este informe se regenera con `pipeline/monitoring_report.py`; no altera candidatos.
