# Simulación de Apuestas por Valor — Comparativa Motor A vs Motor C (Line Shopping + Gating + CLV)

Partidos en Test (2024/25 + 2025/26): **12,373**
- **Log-Loss Motor A v2 (sin cuotas)**: `1.0054`
- **Log-Loss Mercado B365 Apertura (de-vig Power)**: `0.9935`
- **Log-Loss Motor C Híbrido Apertura (Consenso Sharp/AH + Motor A v2)**: **`0.9934`** (supera a B365 Apertura por `-0.0001` nats)
- **Log-Loss Mercado B365 Cierre (de-vig Power)**: `0.9911`

## 1. Baseline: Motor A puro vs B365 Cierre (Sin Gating, sufre Winner's Curse)

| τ | Apuestas | ROI | IC95 % ROI | Acierto | Edge medio |
|---:|---:|---:|---|---:|---:|
| 0.00 | 9,862 | -8.36% | [-11.21%; -5.30%] | 32.2% | +0.137 |
| 0.02 | 8,723 | -8.52% | [-11.52%; -5.04%] | 31.3% | +0.154 |
| 0.05 | 7,032 | -9.50% | [-12.95%; -5.40%] | 29.8% | +0.183 |
| 0.10 | 4,729 | -10.84% | [-15.19%; -5.61%] | 27.2% | +0.236 |
| 0.15 | 3,151 | -11.15% | [-17.60%; -4.23%] | 25.4% | +0.292 |

## 2. Motor C (Híbrido + Anti-Winner's Curse Gating) en B365 Apertura (con Auditoría CLV)

| τ | Apuestas | ROI | IC95 % ROI | P(ROI>0) | CLV medio | % Bate Cierre |
|---:|---:|---:|---|---:|---:|---:|
| 0.00 | 761 | **+2.29%** | [-9.60%; +14.87%] | 64.8% | +3.71% | 56.4% |
| 0.02 | 388 | **+8.55%** | [-13.12%; +32.31%] | 79.2% | +3.35% | 54.6% |
| 0.05 | 228 | **+22.32%** | [-11.82%; +56.45%] | 89.4% | +2.46% | 51.3% |
| 0.10 | 142 | **+38.84%** | [-18.95%; +96.35%] | 91.6% | +2.80% | 47.2% |
| 0.15 | 87 | **+30.98%** | [-33.91%; +113.21%] | 82.1% | +2.20% | 42.5% |

## 3. Motor C + Line Shopping (`Max` Apertura) + Anti-Winner's Curse Gating

| τ | Apuestas | ROI | IC95 % ROI | P(ROI>0) | CLV vs B365 Cierre | % Bate Cierre |
|---:|---:|---:|---|---:|---:|---:|
| 0.00 | 761 | **+5.81%** | [-7.58%; +20.62%] | 79.5% | +6.26% | 66.9% |
| 0.02 | 388 | **+14.89%** | [-10.00%; +43.89%] | 88.0% | +7.40% | 69.6% |
| 0.05 | 228 | **+32.21%** | [-8.42%; +77.07%] | 93.5% | +7.79% | 66.7% |
| 0.10 | 142 | **+53.42%** | [-15.32%; +128.87%] | 94.4% | +9.30% | 64.1% |
| 0.15 | 87 | **+48.56%** | [-30.61%; +170.45%] | 86.2% | +10.54% | 58.6% |

## 4. Fixtures Pre-Registrados (n=146)

| τ | Apuestas (Motor A) | ROI (Motor A) | Apuestas (Gated Hybrid) | ROI (Gated Hybrid) |
|---:|---:|---:|---:|---:|
| 0.00 | 111 | -1.23% | 1 | -100.00% |
| 0.02 | 96 | -2.05% | 0 | — |
| 0.05 | 75 | -4.81% | 0 | — |
| 0.10 | 46 | -19.46% | 0 | — |
| 0.15 | 23 | -48.48% | 0 | — |
