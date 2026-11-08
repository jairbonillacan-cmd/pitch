# INFORME GLOBAL — Reconstrucción del motor de tendencias de Linemate (linemate.io)

Fecha: 2026-11-08 · Método: REA (capturas Playwright + análisis estático) + extracción dirigida del bundle + experimentación controlada contra la API pública.
**Aviso**: esto es una reconstrucción del comportamiento OBSERVABLE. No hay acceso al backend; lo no observable se marca como inferido o indeterminado. NO es una afirmación de reconstrucción exacta del motor interno completo.

---

## 1. Naturaleza del "motor"

Linemate NO publica probabilidades de modelos de ML en el sentido clásico. Su producto son **tendencias (trends)**: registros históricos de acierto ("Hit in 8 of last 10 games") sobre líneas de apuestas, combinados con señales contextuales (rival, sede, lesiones, clima, ranking defensivo) y las odds reales por sportsbook. La "predicción" implícita es el hit-rate histórico; la evaluación de valor la hace el usuario comparando hit-rate vs odds. Además hay elementos probabilísticos de apoyo (`winPercentage` por equipo, `matchupGrades`) cuyo origen es server-side y no determinable desde el cliente (§7).

## 2. Pipeline confirmado (etapa por etapa)

| Etapa | Estado | Evidencia |
|---|---|---|
| **Fuente de datos deportivos** | CONFIRMADA (vendor inferido por IDs) | NFL/NBA: `SRID` (Sportradar) + `sleeperId` (Sleeper) en jugadores/equipos; fútbol: `statsPerformId` (StatsPerform/Opta); `srGameId`/`providerIds.sportradar` en juegos. MLB fuera de temporada (sin datos al 2026-11-08). |
| **Odds de sportsbooks** | CONFIRMADA (agregación server-side) | `market.books` por operador (30+ en NHL: betmgm, draftkings, caesars, fanduel, prizepicks, underdog, sleeper, kalshi, polymarket…) con `current`, `opening`, `alternates` y `operatorData` nativos (p. ej. `projectionId` de PrizePicks, `selectionId` de Caesars). |
| **Obtención/limpieza** | SERVER-SIDE (no observable) | El cliente solo recibe resultados; no hay endpoints crudos de ingesta visibles. |
| **Variables estadísticas** | CONFIRMADA (game logs públicos) | `/api/{sport}/v4/players/{id}/games?timeframe=RANGE_2024_2026` — stats por partido (incluye 1Q/1P) usadas por el motor. |
| **Cálculo del hit-rate** | CONFIRMADA + REPRODUCIDA | Regla y ventanas en §4; validación 310/312 señales exactas en 4 deportes (§5). |
| **Selección/rankeo de trends** | PARCIALMENTE CONFIRMADA | El motor emite MÚLTIPLES trends por jugador/mercado con ventanas N distintas (rachas y forma); los endpoints exponen filtros (`signals`, `trendTypes`, `lineTypes`, `groups=SAFE/RISKY/FIRST_Q`). Criterio de generación (qué ventanas emite y por qué) = inferido. |
| **Calibración/probabilidades** | PARCIAL | `winPercentage` por equipo (suma 100 exacta) NO es devig del moneyline ni función de los matchupGrades (RMSE 12.4pp) → modelo propio server-side, origen indeterminado. |
| **Evaluación de valor** | NO EXISTE EN CLIENTE | No se halló cálculo de edge/EV en el bundle; la UI muestra hit-rate y odds en paralelo. |
| **Interfaz** | CONFIRMADA | SPA React; el bundle NO contiene la cadena "Hit in " (0 ocurrencias) ni código de conteo de hits: todo llega calculado desde la API (`hitRate`, `description`, `annotation`). |

## 3. Fórmula del hit-rate (CONFIRMADA, 2 snapshots independientes)

Para un trend `(jugador/equipo, market, line, outcome, ventana N)`:

```
hit    : stat < line  (under)   |  stat > line (over)  |  stat >= 1 (yes)  |  stat == 0 (no)
push   : stat == line (solo over/under)
miss   : resto
hitRate = hits / games * 100
average = media del stat en la ventana
Ventanas:
  RECENT_FORM   → últimos N partidos (cualquier sede/rival)
  HOME_SPLIT    → últimos N partidos en casa
  AWAY_SPLIT    → últimos N partidos fuera
  HEAD_TO_HEAD  → últimos N partidos vs el rival (código de equipo)
  INJURY_IMPACT → últimos N partidos en que el jugador actuó SIN el compañero lesionado
                  (el compañero no aparece en su propio game log de esos gameID)
```

Team trends: `TEAM_TOTAL` = puntos del equipo (full / 1H = p1q+p2q / 1Q = p1q); `MONEY_LINE` = `win==1`; `SPREAD` = margen + **closing spread histórico** (`odds.spread` por juego en el team log) > 0; `MONEY_LINE_1H`/`SPREAD_1H` = con scores 1H del rival cruzando gameIDs.

Parlays: legs = mini-trends (con `trendId`); señal del parlay = "CADA leg acierta ≥ X en sus últimos N" (ventana propia de cada leg según sede/rival); `annotation` = tasa mínima entre legs.

## 4. Validación numérica (resultados reproducidos)

| Suite | Resultado | Nota |
|---|---|---|
| NFL player signals (2 snapshots) | **112/112 counts exactos**; 97/112 con `average` exacto | Las 15 divergencias de `average` son TODAS de HEAD_TO_HEAD donde el API devuelve `average: 0.0` (bug/quirk server reproducible) |
| NFL INJURY_IMPACT | **13/13 exactos** | Requiere game log del compañero lesionado (Riley Leonard, Alec Pierce, Deebo Samuel, etc.) |
| NFL team trends | **30/30 exactos** | Incluye SPREAD con closing lines históricas y 1H/1Q por quarters |
| Parlays NFL | **14/15 consistentes** | 1 diff: ventana de split con histórico insuficiente (17 de 20) — borde |
| NBA | **46/46 exactos** | POINTS, REBOUNDS, ASSISTS, STEALS+BLOCKS, TURNOVERS, 3PM, P+R… |
| NHL | **44/45 exactos** | 1 diff: portero SAVES (probable exclusión de juegos sin titularidad) |
| EPL | **50/50 exactos** | CARDS = yellow+red+second-yellow; SHOTS = totalShots; StatsPerform fields |
| TOTAL | **310/312 señales reproducidas exactamente** | engine.py + validate.py + validate_other.py en el workspace |

## 5. Arquitectura

- **Todo el cómputo es server-side** (api.linemate.io, backend dinámico en Google Frontend/Cloud Run; sin cabeceras de caché). El cliente (SPA React CRA, un bundle) solo renderiza: 0 ocurrencias de lógica de conteo; registro client-side de mercados solo para **mostrar** stat tables y rankings de apoyo.
- API REST pública (GET, sin auth) para trends/games/teams/rankings; Bearer (Firebase ID token) para usuario/pagos.
- Identificador `trendId`: sha256-256hex, **clave determinista** (GET `/api/{sport}/v1/trends/straights/{trendId}` lo recupera) — la derivación del hash es server-side y NO fue invertible con 344 candidatos de campos canónicos probados.
- El motor emite **múltiples trends por (jugador, mercado, línea, outcome)** diferenciados por tamaño de ventana (rachas cortas "X of last 2/3" y forma "X of last 10/13/20").

## 6. Frecuencia de actualización (observada)

- Sin caché HTTP: cada GET sirve datos del momento (date header dinámico).
- `trendId` estables entre fetches (10/10 en 3 s) → los trends no se recalculan por request, sino por eventos de datos.
- 356 líneas de odds comparadas entre 2 fetches a 3 s: 0 cambios → odds event-driven (cuando el book mueve), no por request.
- `/api/nfl/v3/teams/rankings` expone `timestamp` del snapshot de datos (ej. 19:00:15Z del día) → refresco periódico de rankings durante el día de juego.
- `games/current|upcoming` cambian de estado (SCHEDULED→LIVE/FINAL) — la API sirve `status` y resultados con scores.

## 7. Elementos NO determinados (trazabilidad)

| Elemento | Estado | Detalle |
|---|---|---|
| `winPercentage` por equipo | INDETERMINADO | Server-side; suma 100 exacta; NO es devig del ML (CIN-ATL devig 50.2 vs API 37.4) ni de spread/total ni función de matchupGrades. Candidatos: modelo propio (power ratings), o splits de apuestas. |
| Métrica exacta de OPPONENT_RANK por trend | INFERIDA (mecanismo confirmado) | El bundle define por mercado `defensiveTeamFields` + `defensiveSortingOrder:asc` (y variantes por posición `opposingPositionalSupportingStats`). Rank 32 = peor defensa. 10/18 casos matchearon directo con positionalStats; los 8 restantes tienen decenas de métricas agregadas compatibles (espacio no invertible unívocamente; además los ranks son sensibles al snapshot horario: DAL 32nd vs 30th el mismo día). |
| Regla de generación de ventanas N | INFERIDA | Emite rachas (100%/0%) y forma (N=2..20) — criterio exacto de selección no observable. |
| Ingesta/limpieza upstream | NO OBSERVABLE | Server-side; vendor inferido por IDs. |
| trendId hash input | NO DETERMINADO | Clave determinista verificada; derivación desconocida. |
| Bug `average:0.0` en HEAD_TO_HEAD | REPRODUCIDO (no explicado) | Consistente en todos los casos observados. |
| Calibración de hit-rates vs resultados futuros | PENDIENTE | Requiere histórico temporal (backtesting) — el API no expone series históricas de trends cerrados. |

## 8. Reproducción (entregables en el workspace)

- `engine.py` — motor independiente (NFL completo: player/team/injury/parlay; mapeos NBA/NHL/EPL en validate_other.py).
- `validate.py` / `validate_other.py` — arneses que validan contra la API en vivo.
- `api/` — payloads de referencia; `app/main.1f0201a8.js` — bundle analizado.
- Informes por deporte: REPORT-NFL.md, REPORT-NBA.md, REPORT-EPL.md, REPORT-NHL.md (+ MLB en el global).

**Diferencias respecto al motor original**: nuestro motor reproduce el conteo de hit-rates y señales con exactitud observable, pero NO incluye: (1) la selección/generación de qué trends publicar, (2) `winPercentage` y matchupGrades internos, (3) el pipeline de ingesta/limpieza upstream, (4) la derivación del trendId. No debe afirmarse que es "el motor original": es una reproducción fiel de su capa de cálculo observable.
