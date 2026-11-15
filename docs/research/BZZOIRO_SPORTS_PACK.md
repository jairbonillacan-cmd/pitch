# Bzzoiro Sports Data: qué nos da el plan actual

Verificado el 2026-11-15 (02:00 UTC) con nuestra `BZZOIRO_API_KEY`, más la documentación pública (`/docs/`, `/pricing/`, `/docs/api-license/` v4.0). Fuentes: https://sports.bzzoiro.com/docs/ y llamadas reales.

## Lo que comprobamos con la clave

| Prueba | Resultado |
|---|---|
| Cabecera `RateLimit` en `/api/v2/leagues/` | **No llega** → la cuenta no tiene cuota diaria (las cuentas de pago no reciben la cabecera). |
| `/api/v2/odds/?bookmaker_slug=pinnacle` | 200, 1,900 filas: momios **por casa**, con apertura, movimiento y `is_live`. |
| `/api/v2/odds/best/?market=1x2` | 200, mejor precio por resultado y casa (167 partidos). |
| `/api/v2/odds/?market=total_corners` | 200, 2,184 filas (líneas 7.5–11.5). |
| `/api/v2/bookmakers/` | 89 casas, entre ellas Pinnacle, Bet365, Codere, Betcris, DraftKings, FanDuel, BetMGM, Caesars no, **Caliente no**. |
| Deportes del pack (`/basketball/`, `/hockey/`, `/tennis/`, `/darts/`, `/csgo/`, `/padel/`, `/horseracing/`) | Todos 200 (sin 402 `addon_required`). |
| Image API | 200 PNG sin autenticación para fútbol, básquetbol y hockey; `?sor=true&bg=transparent` funciona. |

Las momios por casa y `/odds/best/` son del plan **Football Unlimited** según `/pricing/`; con nuestra clave responden, así que la cuenta los tiene (o el pack los incluye). Conviene confirmarlo en la cuenta de Bzzoiro.

## Cobertura actual (`/api/v2/coverage/`)

| Deporte | Estado | Partidos próx. 7 d | Con momios 7 d | Ligas/torneos |
|---|---|---|---|---|
| Fútbol | en temporada | 453 | 169 | 103 competiciones (incluye Liga MX Apertura/Clausura, las 5 grandes, Champions, Libertadores, CONCACAF) |
| Tenis | en temporada | 385 | 30 | 761 torneos (ATP, WTA, Challenger, ITF) |
| Básquetbol | en temporada | 126 | 58 | NBA, WNBA, Euroleague, Eurocup, ACB, Lega A, BBL, Serie A2 |
| Hockey | en temporada | 197 | 53 | 13 ligas europeas (KHL, SHL, Liiga, DEL, NL…). **Sin NHL.** |
| Dardos | en temporada | 75 | 15 | PDC (Premier League, European Tour, Grand Slam…) |
| Carreras de caballos | en temporada | 236 | 236 | Reino Unido e Irlanda |
| CS2 | fuera de temporada | 0 | 0 | 408 torneos |
| Pádel | — | — | — | 619 torneos (FIP, Premier Padel) |

**No hay NFL, MLB ni NHL.** Para nuestras ligas (NFL + 6 de fútbol), Bzzoiro cubre las 6 de fútbol; la NFL sigue con nflverse. Los motores NHL y MLB de `docs/10-nhl-engine.md` y `docs/11-mlb-engine.md` no tienen fuente aquí.

## Fútbol: lo útil para PitchLab

- **Momios**: 1X2, goles 1.5/2.5/3.5 (más 0.5–4.5), ambos anotan, doble oportunidad, empate no válido, hándicap asiático (−3.5…+3.5), corners, portería a cero, gana sin recibir. Por casa, con apertura y movimiento (`SHORTENING`/`DRIFTING`); `/odds/best/` y `/events/{id}/odds/comparison/`. Tarjetas no se cotizan.
- **`/events/{id}/` + sub-recursos**: `stats` (con shotmap, xG por tiro y por minuto, momentum, posiciones medias), `lineups` (confirmadas o **probables** con `confidence`), `incidents`, `commentary` (incremental con `?since=`), `player-stats`, `h2h`, `odds`, `polymarket`, `prediction`, `metadata`, `availability`, `broadcasts`, `social`.
- **Bajas**: en `/teams/{id}/squad/` (`availability`: `injured`, `doubtful`, `suspended`; tipo y regreso estimado).
- **Predicciones propias** (`/predictions/`): probabilidades 1X2, goles esperados, over/under, BTTS, marcador más probable, corners. Útiles como comparación, no como nuestro motor.
- **Clasificación, top de jugadores, mejor XI, traspasos, árbitros, estadios, transmisiones por país** (`/broadcasts/?country_code=MX`), `fixtures/changes/` para cambios de horario.
- **En vivo**: `/events/live/` (sondeo de 10 s); WebSocket es add-on aparte ($7/mes).

## Otros deportes (rutas)

- Básquetbol `/basketball/api/v2/`: `events/` (+`live/`, `{id}/odds/`, `box-score/`, `team-stats/`, `pregame/`), `players/{id}/games/`, `standings/?league=`, `predictions/`.
- Tenis `/tennis/api/v2/`: `matches/` (+`live/`, `h2h/`, `point-by-point/`, `odds/`), `rankings/`, `predictions/`.
- Hockey, dardos, CS2, caballos y pádel: rutas no verificadas una por una; el listado de ligas/torneos responde.
- Ojo: en estos deportes las probabilidades van de 0 a 1 y el estado es `scheduled` (fútbol usa 0–100 y `upcoming`).

## Image API (sin clave)

`https://sports.bzzoiro.com/img/<tipo>/<id>/` (fútbol) y `/img/<deporte>/<tipo>/<id>/`. Escudos, ligas, jugadores (`?sor=true` recorte de cara), entrenadores, estadios; `?bg=transparent`. Responde 204 si no hay imagen (en la prueba, un id inexistente devolvió 200 con 70 bytes: hay que tratar respuestas mínimas como vacías). Caché de navegador de 1 año. La CSP actual (`img-src 'self' data: blob: https:`) ya lo permite.

## Licencia (v4.0, 2026-10-01): lo que importa

- Permitido: mostrar los datos en la app, guardarlos, entrenar modelos y vender salidas derivadas (nuestras probabilidades y picks).
- Prohibido: redistribuir datos brutos como feed/API/dataset, ni un producto cuyo fin principal sea dar datos brutos. Un comparador de momios que solo reexpone precios por casa podría rozar esto; mostrarlos junto a nuestro análisis es uso de app.
- Logos y fotos (§6): solo para identificar equipos y jugadores dentro de la app; no en marketing.
- No presentar los datos como oficiales; sin garantía para apuestas (§11). No exige atribución explícita (ya la mostramos en el Match Center).

## Qué haría PitchLab con esto

1. **Momios de fútbol desde Bzzoiro** en lugar de The Odds API (`odds-refresh.yml`): sin cuota, más mercados (corners, hándicap asiático) y Pinnacle como línea de referencia. Mantener The Odds API solo para NFL.
2. **Movimiento de línea** (apertura → actual) en la ficha, y «mejor momio» por resultado con Codere/Betcris visibles para México.
3. **Bajas por jugador** desde `/teams/{id}/squad/` y **alineaciones probables** en «Antes del partido».
4. **Escudos y fotos** con la Image API para las 6 ligas, con respaldo propio cuando venga vacío.
5. **Quitar el límite de cuota** del Match Center (`BZZOIRO_LIVE_DAILY_MAX`) y de la ingesta histórica (`--max-requests=1500`), con la cuenta sin cuota.
6. **NBA** como próximo deporte (momios, box score, standings, predicciones). Hockey solo europeo y sin NHL; tenis y dardos son opciones de menor prioridad.

Precios de referencia (`/pricing/`, USD/mes): Football Unlimited $5, Sports Pack $7 ($5 founder), WebSocket $7, Weight of Money $20.
