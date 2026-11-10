# Features de mercado (3ª Generación — `Singularity v3.0` & `Geodesic v2.0`) — generación y validación

Generado: 2026-11-10T21:38:07+00:00

## Cobertura de cuotas 1X2

| Bloque | Partidos | % del total |
|---|---|---|
| open b365 | 138,464 | 75.85% |
| open ps | 76,159 | 41.72% |
| open avg | 122,338 | 67.01% |
| open max | 122,300 | 66.99% |
| open bf | 5,658 | 3.10% |
| open bfe | 12,049 | 6.60% |
| close b365 | 44,508 | 24.38% |
| close ps | 106,130 | 58.13% |
| close avg | 73,109 | 40.05% |
| close max | 73,029 | 40.00% |
| close bf | 5,665 | 3.10% |
| close bfe | 18,047 | 9.89% |

## Cobertura de mercados secundarios y corrección recreativa Liga MX

| Señal / Mercado | Partidos | % del total |
|---|---|---|
| Totales O/U 2.5 Adaptativo (Apertura) | 137,360 | 75.24% |
| Totales O/U 2.5 Adaptativo (Cierre) | 41,648 | 22.81% |
| Handicap Asiático Adaptativo (Apertura) | 127,716 | 69.96% |
| Handicap Asiático Adaptativo (Cierre) | 41,648 | 22.81% |
| 1X2 Implícito desde AH+Totales (Apertura) | 122,083 | 66.87% |
| Partidos Liga MX con corrección de sesgo recreativo (Cierre) | 2,754 | 1.51% |

## Propiedades de los métodos de de-vig (cierre, B365)

| Método | Suma media | Error máx. de suma | % válidos |
|---|---|---|---|
| proportional | 1.00000000 | 2.22e-16 | 24.4% |
| power | 1.00000000 | 2.22e-16 | 24.4% |
| shin | 1.00000000 | 2.22e-16 | 24.4% |
| adaptive | 1.00000000 | 2.22e-16 | 24.4% |

## Margen medio de la casa (overround, 1X2) y peso medio `w_shin` adaptativo

| Fuente | Apertura | Cierre | `w_shin` medio (Cierre) |
|---|---|---|---|
| b365 | 7.388% | 6.432% | 0.744 |
| ps | 3.135% | 2.895% | 0.142 |
| avg | 7.400% | 6.409% | 0.746 |
| max | 1.329% | 0.430% | 0.130 |
| bf | 6.589% | 8.630% | 0.871 |
| bfe | 2.394% | 0.772% | 0.121 |

## Nota de disponibilidad

`open` se supone disponible antes del partido (no hay timestamp en la fuente). `close` es la última cuota previa al inicio: se usa como benchmark de mercado y como escenario de línea de cierre, nunca como feature de un modelo operable con antelación. Los movimientos apertura->cierre se evalúan solo en ese escenario (EXP13).
