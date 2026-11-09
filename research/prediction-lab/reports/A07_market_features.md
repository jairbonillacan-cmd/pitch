# Features de mercado — generación y validación

Generado: 2026-11-09T09:03:48+00:00

## Cobertura de cuotas

| Bloque | Partidos | % del total |
|---|---|---|
| open b365 | 138,320 | 75.83% |
| open ps | 76,159 | 41.75% |
| open avg | 41,492 | 22.75% |
| open max | 41,492 | 22.75% |
| open bf | 5,658 | 3.10% |
| open bfe | 12,439 | 6.82% |
| close b365 | 44,360 | 24.32% |
| close ps | 106,130 | 58.18% |
| close avg | 72,971 | 40.00% |
| close max | 72,970 | 40.00% |
| close bf | 5,665 | 3.11% |
| close bfe | 17,905 | 9.82% |

## Propiedades de los métodos de de-vig (cierre, B365)

| Método | Suma media | Error máx. de suma | % válidos |
|---|---|---|---|
| proportional | 1.00000000 | 2.22e-16 | 24.3% |
| power | 1.00000000 | 2.29e-11 | 24.3% |
| shin | 1.00000000 | 2.42e-13 | 24.3% |

## Margen medio de la casa (overround, 1X2)

| Fuente | Apertura | Cierre |
|---|---|---|
| b365 | 7.388% | 6.428% |
| ps | 3.135% | 2.895% |
| avg | 6.175% | 6.404% |
| max | 1.445% | 0.400% |
| bf | 6.589% | 8.630% |
| bfe | 6.313% | 0.807% |

## Nota de disponibilidad

`open` se supone disponible antes del partido (no hay timestamp en la fuente). `close` es la última cuota previa al inicio: se usa como benchmark de mercado y como escenario de línea de cierre, nunca como feature de un modelo operable con antelación. Los movimientos apertura→cierre se evalúan solo en ese escenario (EXP13).
