# INFORME TÉCNICO — NBA (motor de tendencias Linemate)

Fecha snapshot: 2026-11-08 (inicio de temporada 2026-27).

## 1. Fuentes de datos
- **Vendor**: Sportradar (`SRID` en jugadores/equipos) + Sleeper (`sleeperId`) para pick-'em.
- **Odds**: betmgm, bet99, betano, draftkings, fanatics, dabble (config CA/US), más el pool general.
- **Endpoints**: mismos que NFL con `nba`: `/api/nba/v1/trends/straights|parlays`, `/v3/games/*`, `/v3/teams(/rankings)`, `/v4/players/{id}/games`.
- **Game logs**: ~130 juegos por jugador (RANGE_2024_2026), stats por partido y por cuarto (`points1q`, `assists1q`, `steals1q`, `blocks1q`, `turnovers1q`, `threePointsMade1q`, `minutesPlayed1q`…).

## 2. Mercados observados
POINTS, REBOUNDS, ASSISTS, STEALS, BLOCKS, STEALS_PLUS_BLOCKS, TURNOVERS, THREE_POINTS_MADE, POINTS_PLUS_REBOUNDS, ASSISTS_1Q. El registro client-side define `nba:ne` y `ncaab` = claves de `ne` sin sufijos `_1Q` (no hay mercados de 1Q para NCAA en esta construcción).

## 3. Arquitectura y fórmulas
Idénticas al global (§3): server-side, hit-rule over/under/yes/no con push, ventanas RECENT_FORM/HOME_SPLIT/AWAY_SPLIT/HEAD_TO_HEAD por N del trend. Mapeo stat:
- POINTS→`points`; REBOUNDS→`rebounds`; ASSISTS→`assists`; STEALS_PLUS_BLOCKS→`steals+blocks`; TURNOVERS→`turnovers`; THREE_POINTS_MADE→`threePointsMade`; POINTS_PLUS_REBOUNDS→`points+rebounds`; ASSISTS_1Q→`assists1q`.

## 4. Resultados de pruebas
**46/46 señales reproducidas exactamente** (14 jugadores con logs descargados; ejemplo verificado: Keyonte George, Tyler Herro, Bam Adebayo…). Cero divergencias: la fórmula del motor generaliza sin cambios respecto a NFL.

## 5. Diferencias / no determinado
- Mismas limitaciones que NFL (generación de ventanas, winPercentage, OPPONENT_RANK, hash).
- Señales INJURY_IMPACT/WEATHER no observadas en el snapshot NBA (temporada temprana; el motor las soporta por diseño del registro).
