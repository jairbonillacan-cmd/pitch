# Blend NFL: ratings + GBM situacional

Filas alineadas: 6630 · validación: 4806 · test: 1824

| Candidato | Moneyline (empates = no local) | Sin empates |
|---|---:|---:|
| Ratings | 0.6691 | 0.6682 |
| GBM situacional | 0.6452 | 0.6450 |
| **Blend (peso 0.4 ratings)** | **0.6433** | **0.6428** |
| Mercado | 0.6091 | 0.6085 |

Peso elegido en validación (temporadas < 2020): **0.4**.

> El GBM usa features pre-partido del pipeline situacional (descanso, bye, clima, EPA de QB).
> El blend es un experimento research-only; no está integrado en el producto.
