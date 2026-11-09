# A13 — Snapshots propios de cuotas y monitor de CLV

**Agente:** A13 Odds Capture & CLV Engineer · **Informe consolidado por el orquestador** a partir de
`etl/capture_odds.py`, `etl/clv_monitor.py`, del snapshot real y de `data/snapshots/clv_report.json`
(A13 no llegó a redactar su informe; el orquestador verificó el snapshot y ejecutó el monitor).
**Fecha:** 2026-11-09 · **Fuente:** `https://www.football-data.co.uk/fixtures.csv` (pública, gratuita).

---

## 1. Qué se resolvió

El ciclo 1 cerró con un P0 abierto: **football-data.co.uk no publica timestamps de cuotas**, así
que no se puede medir CLV (closing line value) ni simular una predicción "con la información del
momento". La solución es capturar nuestros propios snapshots fechados de la única fuente gratuita
que publica cuotas **pre-partido**: `fixtures.csv`.

**Primera captura real (verificada):**

| Campo | Valor |
|---|---|
| Archivo | `data/snapshots/odds_20261109T100153Z.csv` |
| `captured_at_utc` | **2026-11-09T10:01:53Z** |
| Filas (partidos próximos) | **160** |
| Columnas | **94** (cuotas 1X2 de 6 casas, totales 2.5, hándicap asiático) |
| Divisiones | 19 (E0, E1, D1, D2, I1, I2, SP1, SP2, F1, F2, N1, P1, T1, B1, G1, SC0–SC3) |
| Fechas de los partidos | 2026-11-06 … 2026-11-09 |
| `sha256` del payload | `fed7c78c…` (manifest: `19e03ade…` con metadatos) |
| Descarga | 1,645 s, HTTP 200, ETag y Last-Modified registrados |
| `Last-Modified` del origen | **2026-11-06T11:14:29Z** → staleness **70,79 h** |
| Reloj servidor vs local | −2,0 s (cuantificado, no asumido) |
| Cuotas no nulas | B365 160/160, Avg 160/160, Max 160/160, Pinnacle 160/160, BFE 160/160 |

El manifest (`data/snapshots/manifest.json`) guarda por snapshot: bytes, sha256 del archivo y del
payload, filas, columnas presentes/ausentes, cobertura por casa, rango de fechas, cabeceras HTTP,
skew de reloj y **staleness del origen**. Es la trazabilidad que faltaba.

## 2. Hallazgo crítico: el feed es semanal, no en vivo

`Last-Modified` (viernes 6-nov 11:14 UTC) frente a la captura (lunes 9-nov 10:01 UTC) implica que
**159 de los 160 partidos ya habían empezado** en el momento de capturar. El monitor lo detecta y
lo declara:

| Métrica | Valor |
|---|---:|
| Partidos pre-kickoff en la captura | **1** |
| Partidos post-kickoff | **159** |
| Uniones con el histórico (`matches.parquet`) | 0 |
| Con cuota de cierre | 0 |
| Observaciones de CLV | **0** |

Motivos de no-unión: `no_match_row` 150 (el histórico descargado aún no contiene los partidos del
6–9 nov) y `division_not_ingested` 10. **El sistema se niega a calcular CLV con capturas
post-kickoff**, que es exactamente lo correcto: usar una cuota posterior al inicio para medir valor
sería look-ahead.

**Consecuencia operativa:** para tener CLV real hay que capturar **antes del kickoff** y,
idealmente, **varias veces** (p. ej. lunes, jueves y viernes) para reconstruir la trayectoria
apertura → captura → cierre. El script está listo para ejecutarse a diario; el guard de
`source_staleness_hours` evita interpretar como "pre-partido" un fichero de hace tres días.

## 3. Segundo hallazgo: outliers de Betfair Exchange

En el snapshot, dos filas de `SP2` traen **BFE con overround absurdo** (2,13 y 1,95 frente a una
mediana de 1,02). Son glitches de la fuente (cuotas desalineadas), no precios reales. El resto de
casas es plausible:

| Casa | Overround mediano | Máximo | Filas > 1,5 |
|---|---:|---:|---:|
| B365 | 1,0796 | 1,1275 | 0 |
| Avg | 1,0794 | 1,1115 | 0 |
| Max | 1,0376 | 1,0772 | 0 |
| Pinnacle | 1,0909 | 1,1220 | 0 |
| BFE | 1,0204 | **2,1275** | **2** |

**Regla añadida al diseño:** antes de usar una cuota, validar `0,9 ≤ Σ(1/o) ≤ 1,2` por casa;
descartar la fila si no cumple. Así se evita que un glitch contamine el de-vig o el CLV.

## 4. Monitor de CLV

`etl/clv_monitor.py` define:

- `p_captured`: probabilidad de-vig (proporcional o power) en el instante de la captura.
- `p_close`: probabilidad de-vig de la cuota de cierre del histórico.
- `CLV_log = log(p_close) − log(p_captured)` por resultado (H/D/A).
- Agregados: media, mediana, % de observaciones con CLV > 0, por casa y por método.
- Salvaguardas: solo partidos **pre-kickoff** (con margen de zona horaria configurable, 3 h por
  defecto), unión por `(div, fecha, home_slug, away_slug)`, y reporte explícito de cobertura y
  motivos de no-unión.

Hoy el reporte es honestamente vacío (`clv_observations: 0`) porque no hay partidos pre-kickoff en
la primera captura. El valor del entregable es la infraestructura y el diagnóstico, no una cifra
inventada.

## 5. Conexión con Motor B

Con snapshots diarios se podrá construir la feature que el ciclo 1 no pudo: **movimiento de cuota
con timestamps reales** (apertura → intermedia → cierre). Eso permite:
1. Medir CLV de las señales de PitchLab (¿el precio se mueve a favor tras nuestra predicción?).
2. Evaluar si el movimiento aporta información **más allá del cierre** (EXP13 con datos propios).
3. Sustituir la suposición "la apertura está disponible antes del partido" por evidencia fechada.

## 6. Limitaciones

1. **Una sola captura** y con staleness de 70,8 h: no hay serie temporal todavía.
2. El feed es semanal; la granularidad real la fija el proveedor, no nosotros.
3. El histórico aún no contiene los partidos del 6–9 nov, así que no hay cierre con el que comparar.
4. Los nombres de equipo del feed y del histórico pueden diferir; el monitor normaliza con `slug`
   y reporta los no unidos, pero no corrige alias automáticamente.
5. Sin resultados de esos partidos, no hay CLV "realizado" (solo movimiento de precio).

## 7. Reproducibilidad

```bash
cd research/prediction-lab
./.venv/bin/python etl/capture_odds.py            # crea data/snapshots/odds_<UTC>.csv + manifest
./.venv/bin/python etl/clv_monitor.py             # join + CLV (si hay pre-kickoff y cierre)
```

Programación sugerida (no instalada): lunes, jueves y viernes a las 10:00 UTC, y siempre que
`Last-Modified` cambie. El manifest permite deduplicar por sha256.
