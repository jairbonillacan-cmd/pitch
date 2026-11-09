# Features de mercado (2ª Generación) — generación y validación

Generado: 2026-11-09T14:56:37+00:00

## Cobertura de cuotas 1X2

| Bloque | Partidos | % del total |
|---|---|---|
| open b365 | 138,468 | 75.85% |
| open ps | 76,159 | 41.72% |
| open avg | 122,338 | 67.01% |
| open max | 122,338 | 67.01% |
| open bf | 5,658 | 3.10% |
| open bfe | 12,587 | 6.89% |
| close b365 | 44,508 | 24.38% |
| close ps | 106,130 | 58.13% |
| close avg | 73,119 | 40.05% |
| close max | 73,118 | 40.05% |
| close bf | 5,665 | 3.10% |
| close bfe | 18,053 | 9.89% |

## Cobertura de mercados secundarios (Totales y Handicap Asiático)

| Mercado | Partidos | % del total |
|---|---|---|
| Totales O/U 2.5 (Apertura) | 137,416 | 75.27% |
| Totales O/U 2.5 (Cierre) | 41,648 | 22.81% |
| Handicap Asiático (Apertura) | 127,735 | 69.97% |
| Handicap Asiático (Cierre) | 41,648 | 22.81% |
| 1X2 Implícito desde AH+Totales (Apertura) | 122,101 | 66.88% |

## Propiedades de los métodos de de-vig (cierre, B365)

| Método | Suma media | Error máx. de suma | % válidos |
|---|---|---|---|
| proportional | 1.00000000 | 2.22e-16 | 24.4% |
| power | 1.00000000 | 2.22e-16 | 24.4% |
| shin | 1.00000000 | 2.22e-16 | 24.4% |

## Margen medio de la casa (overround, 1X2)

| Fuente | Apertura | Cierre |
|---|---|---|
| b365 | 7.389% | 6.432% |
| ps | 3.135% | 2.895% |
| avg | 7.400% | 6.407% |
| max | 1.322% | 0.406% |
| bf | 6.589% | 8.630% |
| bfe | 6.266% | 0.806% |

## Nota de disponibilidad

`open` se supone disponible antes del partido (no hay timestamp en la fuente). `close` es la última cuota previa al inicio: se usa como benchmark de mercado y como escenario de línea de cierre, nunca como feature de un modelo operable con antelación. Los movimientos apertura→cierre se evalúan solo en ese escenario (EXP13).
