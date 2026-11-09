### Modelos (entrenados en dev, evaluados en val)

| model | descripcion | params | ll_dev | ll_val | brier_val | rps_val | ece_val | n_val |
|:---|:---|:---|---:|---:|---:|---:|---:|---:|
| M0_devig | De-vig power (sin ajuste) | 0 | 0.9974 | 0.9898 | 0.5910 | 0.1989 | 0.0079 | 8148 |
| M1_temp | De-vig + temperatura | 1 | 0.9973 | 0.9897 | 0.5909 | 0.1989 | 0.0074 | 8148 |
| M2_logit | Logística multinomial (log p) | 12 | 0.9972 | 0.9893 | 0.5906 | 0.1988 | 0.0074 | 8148 |
| M3_logit_m | Logística multinomial (log p + margen) | 13 | 0.9972 | 0.9893 | 0.5906 | 0.1988 | 0.0070 | 8148 |
| M4_hgb | HistGradientBoosting (log p + margen) | ~10^2–10^3 | 0.9817 | 0.9903 | 0.5915 | 0.1991 | 0.0093 | 8148 |
| M5_motor_logit | Motor A (logit, sin cuotas) | — | 1.0134 | 1.0086 | 0.6036 | 0.2046 | 0.0130 | 8148 |
| M5_motor_hgb | Motor A (hgb, sin cuotas) | — | 1.0161 | 1.0073 | 0.6028 | 0.2040 | 0.0142 | 8148 |

### Δ vs de-vig power en val (Δ = modelo − de-vig; >0 ⇒ peor)

| model | metric | n | n_blocks | delta | lo | hi |
|:---|:---|---:|---:|---:|---:|---:|
| M1_temp | logloss | 8148 | 23 | -0.00009 | -0.00021 | 0.00002 |
| M1_temp | brier | 8148 | 23 | -0.00004 | -0.00012 | 0.00003 |
| M1_temp | rps | 8148 | 23 | -0.00003 | -0.00006 | 0.00001 |
| M2_logit | logloss | 8148 | 23 | -0.00054 | -0.00090 | -0.00017 |
| M2_logit | brier | 8148 | 23 | -0.00033 | -0.00053 | -0.00013 |
| M2_logit | rps | 8148 | 23 | -0.00008 | -0.00013 | -0.00004 |
| M3_logit_m | logloss | 8148 | 23 | -0.00054 | -0.00089 | -0.00017 |
| M3_logit_m | brier | 8148 | 23 | -0.00033 | -0.00053 | -0.00013 |
| M3_logit_m | rps | 8148 | 23 | -0.00008 | -0.00013 | -0.00004 |
| M4_hgb | logloss | 8148 | 23 | 0.00051 | -0.00097 | 0.00184 |
| M4_hgb | brier | 8148 | 23 | 0.00051 | -0.00043 | 0.00131 |
| M4_hgb | rps | 8148 | 23 | 0.00021 | -0.00023 | 0.00058 |

### Estabilidad de M2: walk-forward dentro de dev

| temporada | n | ll_devig | ll_m2 | delta | dBrier | dRPS |
|---:|---:|---:|---:|---:|---:|---:|
| 2019 | 7229 | 0.99978 | 1.00004 | 0.00026 | 0.00016 | 0.00009 |
| 2020 | 7566 | 1.00682 | 1.00699 | 0.00017 | 0.00005 | 0.00003 |
| 2021 | 8165 | 1.00048 | 1.00042 | -0.00006 | -0.00007 | -0.00001 |
| 2022 | 8127 | 0.99624 | 0.99618 | -0.00006 | -0.00001 | -0.00001 |
