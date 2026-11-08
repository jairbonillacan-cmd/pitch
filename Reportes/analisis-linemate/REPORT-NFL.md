# INFORME TÉCNICO — NFL (motor de tendencias Linemate)

Fecha snapshot: 2026-11-08 (semana 9, en juego). Entregable del objetivo de reconstrucción.

## 1. Fuentes de datos
- **Vendor deportivo**: Sportradar — `SRID` (`sr:player:2197784`), `SRGUID`, `srGameId`/`providerIds.sportradar` (`sr:match:71474296`) en juegos. Nombres en inglés y granularidad de quarters apuntan a feeds US de Sportradar.
- **Proyecciones pick-'em**: Sleeper — `sleeperId` por jugador y `operatorData.projectionId` ("16716078-o-6.5") en las líneas de PrizePicks (los "odds" de PrizePicks/Underdog son proyecciones con payout estándar -137/-137, no mercado real).
- **Odds de sportsbooks** (agregadas server-side): betmgm, draftkings, caesars, fanduel, prizepicks, underdog, sleeper, fanatics, hardrock, bet365, novig, fliff, rebet, prophetx, onyxodds, betrivers, betrpicks, dabble, kalshi, williamhill, thescore, prolineplus, miseojeu, 888sport, bwin, betano, betway, unibet, leovegas, sportsbet, midnite, stadiumlive… (por jurisdicción; ver config-v3 `preferredProvidersV2`).
- **Endpoints observados** (todos GET, públicos):
  - `/api/nfl/v1/trends/straights?limit&lineTypes=MAIN|ALTERNATE&outcomes&trendTypes=PLAYER|TEAM&signals=&preview=`
  - `/api/nfl/v1/trends/straights/{trendId}` (lookup determinista)
  - `/api/nfl/v1/trends/straights/trending` (agrupado "Most bet on"/"Most searched"/juego)
  - `/api/nfl/v1/trends/parlays?parlayType=SAME_GAME|CROSS_GAME` y `/preview`
  - `/api/nfl/v1/discovery/preview/straights?groups=SAFE,RISKY,FIRST_Q`
  - `/api/nfl/v3/games/current|upcoming?recordType=REGULAR&format=daily`
  - `/api/nfl/v3/teams`, `/api/nfl/v3/teams/rankings`, `/api/nfl/v3/teams/injuries`
  - `/api/nfl/v4/players/{id}` y `/v4/players/{id}/games?timeframe=RANGE_2024_2026`
  - `/api/nfl/v4/teams/{id}/games?timeframe=RANGE_2024_2026` (incluye closing odds por juego)
  - `/api/configuration/v3`, `/api/localization/v1/getCurrentLocation`
- **Estructuras clave**: trend = {id(sha256hex), gameId("20261109-BUF-MIN"), timestamp, type(player|team), player/team/opposingTeam, market{type:OVER_UNDER|EVENT, level, name, books, pregameAverages}, line, signals[], home, outcome(over|under|yes|no|cover), alternate, featuredProvider}. Señales con hitRecord {games, hits, pushes, misses, hitRate, average}.

## 2. Arquitectura de procesamiento
- **100% server-side** (bundle sin lógica de conteo: "Hit in " 0 ocurrencias; hitRate solo se muestra). Backend en GCP (Google Frontend), sin caché HTTP.
- El cliente trae un **registro de mercados** para mostrar: p. ej. `RUSHING_ATTEMPTS:{fields:["rushingAttempts"], defensiveTeamFields:["averageStats.defensive.rushingAttempts"], defensiveSortingOrder:"asc", supportingStats:{…}, gamelogStats:{…}}` — espejo de la configuración del motor (útil para reconstruir el mapeo stat↔mercado).
- `winPercentage` y `matchupGrades` (redzone/rushing/passing/points) por equipo en games payload; `insights.bettingSnapshot` y `summaryTags` generados con NL en server.

## 3. Variables y mercados observados (NFL)
Player: RUSHING_YARDS(_1Q), RECEIVING_YARDS(_1Q), RUSHING_PLUS_RECEIVING_YARDS, RECEPTIONS, RUSHING_ATTEMPTS, PASSING_ATTEMPTS, PASSING_YARDS, PASSING_TOUCHDOWNS(_1Q), RUSHING_TOUCHDOWNS, RECEIVING_TOUCHDOWNS, ANYTIME_TOUCHDOWN, LONGEST_RECEPTION, LONGEST_RUN, INTERCEPTIONS (1Q vía `*1q` en game logs).
Team: TEAM_TOTAL(_1H/_1Q), MONEY_LINE(_1H), SPREAD(_1H). EVENT level para ML/SPREAD.

## 4. Fórmulas (CONFIRMADAS — ver REPORT-GLOBAL §3)
Hit-rule y ventanas por señal; SPREAD usa el closing spread de cada juego (`odds.spread` del team log); INJURY_IMPACT usa ausencia del compañero en su game log. Validación NFL: **player 112/112 counts (97 +average), injury 13/13, team 30/30, parlays 14/15**.

## 5. Resultados de pruebas controladas
- Reproducción exacta en 2 snapshots independientes (12:xx y 19:2x UTC) — ids de trend estables, counts idénticos.
- Pruebas de parámetros: `signals=INJURY_IMPACT&preview=true` devuelve previews; `groups=SAFE,RISKY` en discovery; `lineTypes=ALTERNATE` cambia la línea del trend (alternates por book).
- Detección de bug reproducible: `average:0.0` en señales HEAD_TO_HEAD.

## 6. Diferencias respecto al motor original
1. Selección/generación de trends (qué ventanas publica Linemate) = inferida, no confirmada.
2. `winPercentage` (p. ej. KC 55.9% con ML -426) = modelo server-side no identificable.
3. OPPONENT_RANK: mecanismo confirmado (rank defensivo por mercado/posición, asc=1º mejor, 32º=peor); métrica exacta por variante con múltiples candidatas válidas.
4. trendId: derivación del hash no invertida (344 candidatos probados).
5. Ingesta/limpieza upstream (Sportradar→DB) no observable.
