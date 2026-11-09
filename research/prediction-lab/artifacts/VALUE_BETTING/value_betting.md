# Simulación de apuestas por valor

Estrategia: 1 unidad al resultado con mayor `edge = p_modelo·cuota − 1` si supera τ.
Cuotas: B365 de cierre (test) y B365 del snapshot (fixtures).

## Test 2024/25 + 2025/26

Partidos con cuota: **12,373** · log-loss modelo 1.0100 vs mercado 0.9911

| τ | Apuestas | ROI | IC95 % ROI | Acierto | Edge medio |
|---:|---:|---:|---|---:|---:|
| 0.00 | 10,048 | -9.73% | [-12.77%; -6.49%] | 31.3% | +0.154 |
| 0.02 | 8,930 | -10.47% | [-13.59%; -7.02%] | 30.2% | +0.172 |
| 0.05 | 7,325 | -9.52% | [-13.05%; -5.69%] | 29.1% | +0.202 |
| 0.10 | 5,176 | -8.89% | [-13.11%; -4.71%] | 27.3% | +0.255 |
| 0.15 | 3,716 | -11.94% | [-16.76%; -6.71%] | 24.7% | +0.307 |

## Fixtures pre-registrados (n=146)

| τ | Apuestas | ROI | IC95 % ROI | Acierto |
|---:|---:|---:|---|---:|
| 0.00 | 111 | -1.23% | [-26.20%; +20.44%] | 36.0% |
| 0.02 | 96 | -2.05% | [-32.64%; +25.91%] | 35.4% |
| 0.05 | 75 | -4.81% | [-36.65%; +23.51%] | 34.7% |
| 0.10 | 46 | -19.46% | [-62.55%; +22.81%] | 23.9% |
| 0.15 | 23 | -48.48% | [-88.67%; +6.39%] | 17.4% |

## Lectura

Si ningún umbral produce ROI positivo con IC que excluya 0, no hay estrategia de valor.
Un ROI positivo aislado con IC amplio no es evidencia (selección de umbral); se exige
consistencia entre test y fixtures y significancia.
