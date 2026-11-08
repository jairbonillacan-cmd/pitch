# INFORME TÉCNICO — EPL / fútbol (motor de tendencias Linemate)

Fecha snapshot: 2026-11-08 (Matchday 10).

## 1. Fuentes de datos
- **Vendor**: StatsPerform (Opta) — `statsPerformId` poblado en jugadores (`dl10343h8yopcgerzur5samwa`) y equipos; `optaId`, `sleeperId` y `SRID` = null. Único deporte sin Sportradar en los IDs observados.
- **Odds**: casas europeas y de APAC/Norteamérica: betano, bwin, unibet, leovegas, betway, midnite, prolineplus, draftkings, fanduel, betrivers, thescore, dabble, betmgm, prizepicks, underdog, fanatics, hardrock, betrpicks.
- **Games payload** (diferencias fútbol): sin `weather`; `matchupGrades` = {scoring, possession, shooting}; `winPercentage` 50.0/50.0 (sin modelo aparente en este snapshot); `injuries` inline (OUT/SUS/GTD); `rankings` for/against; `lineup` {confirmed, players con GK/DC…}; `title` = "Matchday N".

## 2. Mercados y mapeo (game logs StatsPerform)
- SHOTS → `totalShots` (variantes: shotsInsideBox/OutsideBox, shotsOnTarget)
- SHOTS_ON_TARGET → `shotsOnTarget`
- CARDS → `yellowCards + redCards + yellowRedCards` (validado 50/50)
- TACKLES → `totalTackles`
- GOAL_OR_ASSIST → `goals + assists`
- (registro client-side define además mercados por posición para defensivos)

## 3. Resultados de pruebas
**50/50 señales exactas** (14 jugadores, logs ~2 temporadas). Ejemplos verificados: Cole Palmer, Jackson/Kadioglu. La fórmula global (ventanas + hit-rule) aplica sin cambios.

## 4. Diferencias / no determinado
- Sin señales INJURY_IMPACT/WEATHER en el snapshot; sin trends de team TOTAL/SPREAD observados en fútbol (los mercados de equipo existen vía registro pero no aparecieron en los endpoints muestreados).
- `winPercentage` plano 50/50 en EPL vs modelo en NFL: el componente probabilístico por equipo parece depender del deporte/datos disponibles.
- Vendor único (StatsPerform) implica que la granularidad de quarters/periodos usa medias partes (1H) no cuartos; el motor de ventanas es idéntico.
