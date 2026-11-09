# 04 · Matriz de cobertura real por liga y proveedor

> Regla: una competición no se marca «cubierto» solo porque aparezca en el catálogo del
> proveedor — se marca por **temporadas y campos verificados** en `data/history/manifest.json`
> o por una sonda directa. **Fecha:** 2026-11-08.

## 1. Fútbol (resultados y calendario)

| Liga | openfootball (CC0) — verificado | API-Football Free — sonda 2026-11-08 | Hueco a llenar |
|---|---|---|---|
| Premier League | 2010-11 → 2026-27, 6,098 partidos | — (el producto usa openfootball; football-data.org Free cubre PL en vivo) | ninguno |
| LaLiga | 2012-13 → 2026-27, 5,359 | sin datos en el plan Free (no probado por liga; el plan limita temporadas) | ninguno |
| Bundesliga | 2010-11 → 2026-27, 4,917 | ídem | ninguno |
| Serie A | 2013-14 → 2026-27, 4,944 | ídem | ninguno |
| Ligue 1 | 2014-15 → 2026-27, 4,254 | ídem | ninguno |
| Liga MX | 2018-19, 2019-20, 2020-21, 2024-25 (1,189 partidos; Clausura 2020 cortado por COVID) | **2023 → OK** (340 fixtures); 2019 y 2021 → `errors=plan`; 2022 sin probar | 2021-22 → 2023-24 (6 torneos). Plan: backfill con API-Football Free `season=2022` y `season=2023` |

## 2. Campos disponibles por liga de fútbol (verificado en el corpus)

| Campo | openfootball | Nota |
|---|---|---|
| Fecha, jornada, local, visita, marcador final | ✅ todos | base de Nivel A |
| Torneo (Apertura/Clausura/Playoffs) y fase | ✅ Liga MX | `stage` + `phase: regular/postseason` |
| Hora de inicio | ◐ presente a veces | `kickoff` nullable; zona no declarada |
| Estadísticas de equipo, jugadores, alineaciones, lesiones | ⛔ | no disponible en la fuente |
| xG / event data | ⛔ | no disponible gratis con licencia para nuestras ligas |
| Cuotas | ⛔ | fuera de openfootball; ver `14-historical-odds.md` |

## 3. NFL (nflverse, CC-BY 4.0)

| Dimensión | Verificado |
|---|---|
| Temporadas | 1999 → 2026, 7,407 partidos (regular + postseason; `--no-postseason` excluye playoffs) |
| Campos | fecha, semana, local/visita (por franquicia), marcador, sede neutral, **cuotas de cierre** (spread, total, moneyline local/visita en formato americano) |
| Estadísticas por equipo/jugador semanales | disponibles en otros releases de nflverse (CC-BY 4.0) — **no integrados aún**; siguiente incremento natural para Prop Lab |
| Cuotas | `usage: research-only` (política interna más estricta que la licencia) |

## 4. Cuotas pre-partido (The Odds API Free, 500 créditos/mes)

| Liga | Región | Presupuesto verificado en `FREE_DATA_STRATEGY.md` §3 |
|---|---|---|
| NFL | `us` | ~65 créditos/mes (5 snapshots/semana × 3 mercados) |
| Premier League | `uk`/`eu` (validar casas) | ~80 créditos/mes |
| Liga MX | a validar con `/sports` | ~80 créditos/mes |
| Reserva (catálogo, pruebas, 1-2 históricos puntuales a 10×) | | ~275 créditos/mes |

Cada snapshot cuesta mercados × regiones. El cierre se aproxima con el último snapshot
antes del inicio y la UI lo etiqueta como aproximado.

## 5. Lo que ningún proveedor gratuito cubre hoy (sin fuente = sin feature)

Estadísticas de equipo por partido (tiros, posesión, corners), alineaciones, lesiones,
xG y event data para las 6 ligas de fútbol; cuotas históricas de fútbol con apertura y
cierre. Cualquier modelo que dependa de ellos queda bloqueado hasta encontrar fuente
con licencia comercial (ver `16-cost-comparison.md`).
