# Dataset histórico de PitchLab — reporte de calidad

> Generado automáticamente por `services/ingest/history`. No editar a mano.

- **datasetId:** `35fea620f15ca0aff9f976ef59c2bd1bfde26e9dad1d250823b44d5bd400018d`
- **Generado:** 2026-11-09T01:07:19.291Z
- **Ventana de fútbol:** 2010-11, 2011-12, 2012-13, 2013-14, 2014-15, 2015-16, 2016-17, 2017-18, 2018-19, 2019-20, 2020-21, 2021-22, 2022-23, 2023-24, 2024-25, 2025-26, 2026-27
- **Ventana de NFL:** 1999, 2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026
- **Errores / advertencias:** 0 / 1

## Resumen

| Métrica | Valor |
|---|---:|
| Ligas | 7 |
| Temporadas | 108 |
| Partidos jugados | 34,168 |
| Equipos distintos | 235 |
| Fuentes registradas | 103 |
| Fuentes disponibles | 81 |
| Bytes de origen descargados | 10,424,619 |

## Cobertura por liga

| Liga | Deporte | Producto | Temporadas | Partidos | Equipos | Primero | Último | Local | Empate | Visita | Media |
|---|---|:--:|---:|---:|---:|---|---|---:|---:|---:|---:|
| Bundesliga (`bundesliga`) | soccer | sí | 17 | 4,917 | 33 | 2010-08-20 | 2026-09-20 | 44.9% | 24.2% | 30.9% | 3.041 |
| LaLiga (`la-liga`) | soccer | sí | 15 | 5,359 | 34 | 2012-08-18 | 2026-09-20 | 46.2% | 25.1% | 28.7% | 2.672 |
| Liga MX (`liga-mx`) | soccer | sí | 4 | 1,189 | 21 | 2018-07-20 | 2025-05-04 | 46.8% | 24.5% | 28.8% | 2.701 |
| Ligue 1 (`ligue-1`) | soccer | sí | 13 | 4,254 | 35 | 2014-08-08 | 2026-09-20 | 44.4% | 24.9% | 30.7% | 2.708 |
| NFL (`nfl`) | american-football | sí | 28 | 7,407 | 32 | 1999-09-12 | 2026-11-08 | 56.2% | 0.2% | 43.6% | 44.284 |
| Premier League (`premier-league`) | soccer | sí | 17 | 6,098 | 42 | 2010-08-14 | 2026-09-20 | 44.9% | 23.9% | 31.2% | 2.814 |
| Serie A (`serie-a`) | soccer | sí | 14 | 4,944 | 38 | 2013-08-24 | 2026-09-20 | 42.9% | 25.2% | 31.8% | 2.746 |

## Detalle por liga

### Bundesliga (`bundesliga`)

Archivo: `bundesliga.jsonl` · SHA-256 `72d0399046774236…` · 4,917 filas · goles/puntos por partido 3.041 (local 1.699, visita 1.342).

| Temporada | Partidos | Estado | Primero | Último |
|---|---:|:--:|---|---|
| 2010-11 | 306 | complete | 2010-08-20 | 2011-05-14 |
| 2011-12 | 306 | complete | 2011-08-05 | 2012-05-05 |
| 2012-13 | 306 | complete | 2012-08-24 | 2013-05-18 |
| 2013-14 | 306 | complete | 2013-08-09 | 2014-05-10 |
| 2014-15 | 306 | complete | 2014-08-22 | 2015-05-23 |
| 2015-16 | 306 | complete | 2015-08-14 | 2016-05-14 |
| 2016-17 | 306 | complete | 2016-08-26 | 2017-05-20 |
| 2017-18 | 306 | complete | 2017-08-18 | 2018-05-12 |
| 2018-19 | 306 | complete | 2018-08-24 | 2019-05-18 |
| 2019-20 | 306 | complete | 2019-08-16 | 2020-06-27 |
| 2020-21 | 306 | complete | 2020-09-18 | 2021-05-22 |
| 2021-22 | 306 | complete | 2021-08-13 | 2022-05-14 |
| 2022-23 | 306 | complete | 2022-08-05 | 2023-05-27 |
| 2023-24 | 306 | complete | 2023-08-18 | 2024-05-18 |
| 2024-25 | 306 | complete | 2024-08-23 | 2025-05-17 |
| 2025-26 | 294 | partial | 2025-08-22 | 2026-05-16 |
| 2026-27 | 33 | partial | 2026-08-28 | 2026-09-20 |

### LaLiga (`la-liga`)

Archivo: `la-liga.jsonl` · SHA-256 `8481db5fc391e726…` · 5,359 filas · goles/puntos por partido 2.672 (local 1.532, visita 1.141).

| Temporada | Partidos | Estado | Primero | Último |
|---|---:|:--:|---|---|
| 2012-13 | 380 | complete | 2012-08-18 | 2013-06-01 |
| 2013-14 | 380 | complete | 2013-08-17 | 2014-05-18 |
| 2014-15 | 380 | complete | 2014-08-23 | 2015-05-23 |
| 2015-16 | 380 | complete | 2015-08-21 | 2016-05-15 |
| 2016-17 | 380 | complete | 2016-08-19 | 2017-05-21 |
| 2017-18 | 380 | complete | 2017-08-18 | 2018-05-20 |
| 2018-19 | 380 | complete | 2018-08-17 | 2019-05-19 |
| 2019-20 | 380 | complete | 2019-08-16 | 2020-07-19 |
| 2020-21 | 380 | complete | 2020-09-12 | 2021-05-23 |
| 2021-22 | 380 | complete | 2021-08-13 | 2022-05-22 |
| 2022-23 | 380 | complete | 2022-08-12 | 2023-06-04 |
| 2023-24 | 380 | complete | 2023-08-11 | 2024-05-26 |
| 2024-25 | 370 | partial | 2024-08-15 | 2025-05-18 |
| 2025-26 | 365 | partial | 2025-08-15 | 2026-05-24 |
| 2026-27 | 64 | partial | 2026-08-15 | 2026-09-20 |

### Liga MX (`liga-mx`)

Archivo: `liga-mx.jsonl` · SHA-256 `2c5ba79a7a647de4…` · 1,189 filas · goles/puntos por partido 2.701 (local 1.545, visita 1.156).

| Temporada | Partidos | Estado | Primero | Último |
|---|---:|:--:|---|---|
| 2018-19 | 306 | complete | 2018-07-20 | 2019-05-05 |
| 2019-20 | 261 | partial | 2019-07-19 | 2020-03-15 |
| 2020-21 | 310 | complete | 2020-07-24 | 2021-05-02 |
| 2024-25 | 312 | complete | 2024-07-05 | 2025-05-04 |

### Ligue 1 (`ligue-1`)

Archivo: `ligue-1.jsonl` · SHA-256 `4e1906a03af592a5…` · 4,254 filas · goles/puntos por partido 2.708 (local 1.508, visita 1.200).

| Temporada | Partidos | Estado | Primero | Último |
|---|---:|:--:|---|---|
| 2014-15 | 380 | complete | 2014-08-08 | 2015-05-23 |
| 2015-16 | 380 | complete | 2015-08-07 | 2016-05-14 |
| 2016-17 | 380 | complete | 2016-08-12 | 2017-05-20 |
| 2017-18 | 380 | complete | 2017-08-04 | 2018-05-19 |
| 2018-19 | 380 | complete | 2018-08-10 | 2019-05-24 |
| 2019-20 | 279 | partial | 2019-08-09 | 2020-03-08 |
| 2020-21 | 380 | complete | 2020-08-21 | 2021-05-23 |
| 2021-22 | 380 | complete | 2021-08-06 | 2022-05-21 |
| 2022-23 | 380 | complete | 2022-08-05 | 2023-06-03 |
| 2023-24 | 306 | complete | 2023-08-11 | 2024-05-19 |
| 2024-25 | 306 | complete | 2024-08-16 | 2025-05-17 |
| 2025-26 | 282 | partial | 2025-08-15 | 2026-05-17 |
| 2026-27 | 41 | partial | 2026-08-21 | 2026-09-20 |

### NFL (`nfl`)

Archivo: `nfl.jsonl` · SHA-256 `570159b5793e70b3…` · 7,407 filas · goles/puntos por partido 44.284 (local 23.296, visita 20.988).

| Temporada | Partidos | Estado | Primero | Último |
|---|---:|:--:|---|---|
| 1999 | 259 | complete | 1999-09-12 | 2000-01-30 |
| 2000 | 259 | complete | 2000-09-03 | 2001-01-28 |
| 2001 | 259 | complete | 2001-09-09 | 2002-02-03 |
| 2002 | 267 | complete | 2002-09-05 | 2003-01-26 |
| 2003 | 267 | complete | 2003-09-04 | 2004-02-01 |
| 2004 | 267 | complete | 2004-09-09 | 2005-02-06 |
| 2005 | 267 | complete | 2005-09-08 | 2006-02-05 |
| 2006 | 267 | complete | 2006-09-07 | 2007-02-04 |
| 2007 | 267 | complete | 2007-09-06 | 2008-02-03 |
| 2008 | 267 | complete | 2008-09-04 | 2009-02-01 |
| 2009 | 267 | complete | 2009-09-10 | 2010-02-07 |
| 2010 | 267 | complete | 2010-09-09 | 2011-02-06 |
| 2011 | 267 | complete | 2011-09-08 | 2012-02-05 |
| 2012 | 267 | complete | 2012-09-05 | 2013-02-03 |
| 2013 | 267 | complete | 2013-09-05 | 2014-02-02 |
| 2014 | 267 | complete | 2014-09-04 | 2015-02-01 |
| 2015 | 267 | complete | 2015-09-10 | 2016-02-07 |
| 2016 | 267 | complete | 2016-09-08 | 2017-02-05 |
| 2017 | 267 | complete | 2017-09-07 | 2018-02-04 |
| 2018 | 267 | complete | 2018-09-06 | 2019-02-03 |
| 2019 | 267 | complete | 2019-09-05 | 2020-02-02 |
| 2020 | 269 | complete | 2020-09-10 | 2021-02-07 |
| 2021 | 285 | complete | 2021-09-09 | 2022-02-13 |
| 2022 | 284 | complete | 2022-09-08 | 2023-02-12 |
| 2023 | 285 | complete | 2023-09-07 | 2024-02-11 |
| 2024 | 285 | complete | 2024-09-05 | 2025-02-09 |
| 2025 | 285 | complete | 2025-09-04 | 2026-02-08 |
| 2026 | 131 | complete | 2026-09-09 | 2026-11-08 |

### Premier League (`premier-league`)

Archivo: `premier-league.jsonl` · SHA-256 `e0c1c451ca460c8e…` · 6,098 filas · goles/puntos por partido 2.814 (local 1.562, visita 1.252).

| Temporada | Partidos | Estado | Primero | Último |
|---|---:|:--:|---|---|
| 2010-11 | 380 | complete | 2010-08-14 | 2011-05-22 |
| 2011-12 | 380 | complete | 2011-08-13 | 2012-05-13 |
| 2012-13 | 380 | complete | 2012-08-18 | 2013-05-19 |
| 2013-14 | 380 | complete | 2013-08-17 | 2014-05-11 |
| 2014-15 | 380 | complete | 2014-08-16 | 2015-05-24 |
| 2015-16 | 380 | complete | 2015-08-08 | 2016-05-17 |
| 2016-17 | 380 | complete | 2016-08-13 | 2017-05-21 |
| 2017-18 | 380 | complete | 2017-08-11 | 2018-05-13 |
| 2018-19 | 380 | complete | 2018-08-10 | 2019-05-12 |
| 2019-20 | 380 | complete | 2019-07-01 | 2020-06-30 |
| 2020-21 | 380 | complete | 2020-09-12 | 2021-05-23 |
| 2021-22 | 380 | complete | 2021-08-13 | 2022-05-22 |
| 2022-23 | 380 | complete | 2022-08-05 | 2023-05-28 |
| 2023-24 | 380 | complete | 2023-08-11 | 2024-05-19 |
| 2024-25 | 380 | complete | 2024-08-16 | 2025-05-25 |
| 2025-26 | 353 | partial | 2025-08-15 | 2026-05-24 |
| 2026-27 | 45 | partial | 2026-08-21 | 2026-09-20 |

### Serie A (`serie-a`)

Archivo: `serie-a.jsonl` · SHA-256 `b8d73e345e98884e…` · 4,944 filas · goles/puntos por partido 2.746 (local 1.498, visita 1.248).

| Temporada | Partidos | Estado | Primero | Último |
|---|---:|:--:|---|---|
| 2013-14 | 380 | complete | 2013-08-24 | 2014-05-18 |
| 2014-15 | 380 | complete | 2014-08-30 | 2015-05-31 |
| 2015-16 | 380 | complete | 2015-08-22 | 2016-05-15 |
| 2016-17 | 380 | complete | 2016-08-20 | 2017-05-28 |
| 2017-18 | 380 | complete | 2017-08-19 | 2018-05-20 |
| 2018-19 | 380 | complete | 2018-08-18 | 2019-05-26 |
| 2019-20 | 380 | complete | 2019-08-24 | 2020-08-02 |
| 2020-21 | 380 | complete | 2020-09-19 | 2021-05-23 |
| 2021-22 | 380 | complete | 2021-08-21 | 2022-05-22 |
| 2022-23 | 380 | complete | 2022-08-13 | 2023-06-04 |
| 2023-24 | 380 | complete | 2023-08-19 | 2024-06-02 |
| 2024-25 | 370 | partial | 2024-08-17 | 2025-05-18 |
| 2025-26 | 344 | partial | 2025-08-23 | 2026-05-24 |
| 2026-27 | 50 | partial | 2026-08-22 | 2026-09-20 |

## Fuentes

| Proveedor | Licencia | Atribución | Archivos disponibles | Bytes |
|---|---|---|---:|---:|
| nflverse | CC-BY-4.0 | Datos: nflverse (nflverse-data, CC-BY 4.0) | 1 | 2,189,016 |
| openfootball | CC0-1.0 | Datos: openfootball/football.json (CC0 1.0) | 80 | 8,235,603 |

Archivos no publicados por la fuente (HTTP 404), 22 en total: `openfootball-es.1-2010-11`, `openfootball-es.1-2011-12`, `openfootball-it.1-2010-11`, `openfootball-it.1-2011-12`, `openfootball-it.1-2012-13`, `openfootball-fr.1-2010-11`, `openfootball-fr.1-2011-12`, `openfootball-fr.1-2012-13`, `openfootball-fr.1-2013-14`, `openfootball-mx.1-2010-11`, `openfootball-mx.1-2011-12`, `openfootball-mx.1-2012-13`, `openfootball-mx.1-2013-14`, `openfootball-mx.1-2014-15`, `openfootball-mx.1-2015-16`, `openfootball-mx.1-2016-17`, `openfootball-mx.1-2017-18`, `openfootball-mx.1-2021-22`, `openfootball-mx.1-2022-23`, `openfootball-mx.1-2023-24`, `openfootball-mx.1-2025-26`, `openfootball-mx.1-2026-27`.

## Hallazgos de calidad

### Errores

_Ninguno._

### Advertencias

- **season_under_median** · `ligue-1`: 1 temporadas tienen menos del 85 % de la mediana de su grupo (posible cancelación o datos incompletos).
  - 2019-20: 279 de ~380

### Información

- **season_partial** · `bundesliga`: 2 temporadas tienen menos partidos que la referencia (306); suele ser la temporada en curso.
  - 2025-26: 294 · 2026-27: 33
- **season_in_progress** · `bundesliga`: 1 temporadas en curso tienen menos partidos jugados que una temporada cerrada.
  - 2026-27: 33
- **season_partial** · `la-liga`: 3 temporadas tienen menos partidos que la referencia (380); suele ser la temporada en curso.
  - 2024-25: 370 · 2025-26: 365 · 2026-27: 64
- **season_in_progress** · `la-liga`: 1 temporadas en curso tienen menos partidos jugados que una temporada cerrada.
  - 2026-27: 64
- **season_partial** · `liga-mx`: 1 temporadas tienen menos partidos que la referencia (306); suele ser la temporada en curso.
  - 2019-20: 261
- **season_partial** · `ligue-1`: 3 temporadas tienen menos partidos que la referencia (306); suele ser la temporada en curso.
  - 2019-20: 279 · 2025-26: 282 · 2026-27: 41
- **season_in_progress** · `ligue-1`: 1 temporadas en curso tienen menos partidos jugados que una temporada cerrada.
  - 2026-27: 41
- **season_in_progress** · `nfl`: 1 temporadas en curso tienen menos partidos jugados que una temporada cerrada.
  - 2026: 131
- **season_partial** · `premier-league`: 2 temporadas tienen menos partidos que la referencia (380); suele ser la temporada en curso.
  - 2025-26: 353 · 2026-27: 45
- **season_in_progress** · `premier-league`: 1 temporadas en curso tienen menos partidos jugados que una temporada cerrada.
  - 2026-27: 45
- **season_partial** · `serie-a`: 3 temporadas tienen menos partidos que la referencia (380); suele ser la temporada en curso.
  - 2024-25: 370 · 2025-26: 344 · 2026-27: 50
- **season_in_progress** · `serie-a`: 1 temporadas en curso tienen menos partidos jugados que una temporada cerrada.
  - 2026-27: 50

## Reglas metodológicas

- Solo entran partidos **jugados** con marcador final; los programados se descartan.
- `availableAt` = fin del día del partido + 24 h. Es el lag conservador de datos que no capturamos en vivo y lo que usan los features as-of.
- La NFL se identifica por **franquicia**, no por ciudad: `STL` y `LA` son `nfl.los-angeles-rams`; `OAK` y `LV` son `nfl.las-vegas-raiders`; `SD` y `LAC` son `nfl.los-angeles-chargers`.
- Las cuotas de cierre de nflverse (`odds`) son **solo para investigación interna** (`usage: research-only`): no se publican ni se redistribuyen.
- El histórico no usa el manifiesto de emblemas: un club relegado conserva su identidad.

## Cómo regenerar

```bash
pnpm history                     # todo el catálogo y todas las temporadas
pnpm history --offline           # solo con la caché de data/history/raw
pnpm history --leagues=premier-league,nfl
pnpm history --soccer-seasons=2024-25,2025-26
```
