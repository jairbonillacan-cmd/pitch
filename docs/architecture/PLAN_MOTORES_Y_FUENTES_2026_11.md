# Plan de motores y fuentes de datos · noviembre 2026

> **Fecha:** 2026-11-14 · **Base:** reportes de Astra en la rama `scrap` (`Reportes/analisis-astra/06`, `07`, `14` y `17`) y los motores de `packages/spacetime`.
> **Configuración de claves:** `.env.example` (bloque «Proveedores de datos») y `services/ingest/src/providers/config.ts`. Prueba: `pnpm --filter @pitchlab/ingest providers:check`.

## 1. Qué tomar de Astra y qué no

| Tomar | Por qué | Cómo lo hacemos mejor |
|---|---|---|
| Un análisis IA por partido, generado en lote | Costo marginal $0 por lector | DeepSeek con JSON que dice explícitamente quién es local y quién visitante, más validador de números y roles antes de guardar (Astra invirtió local/visitante en el 20.7 % de la NFL con Haiku) |
| Momios gratis del scoreboard de ESPN (DraftKings) para NBA, NFL, NHL y MLB | Línea de referencia sin pagar | Mostrar casa y hora de captura, quitar margen y comparar contra nuestra cuota justa |
| Modelo propio de xG de NHL entrenado con el play-by-play gratuito de `api-web.nhle.com` | AUC 0.75 con 116 mil tiros | Igual, pero con portero confirmado (Astra tuvo 100 % de porteros sin confirmar) |
| Separar 5v5, power play y penalty kill en NHL; portería vacía; Monte Carlo para OT/SO | Es lo más fino de su NHL | Sumarlo a Curvature |
| MLB por tramos: abridor + bullpen con Binomial Negativa; mercado F5 | Abre primeras 5 entradas y run line | Sin sus 4 errores (ver §2.2) |
| Córners, tarjetas y tiros con Binomial Negativa y árbitro con shrinkage | Bet Builder | Condicionados al marcador esperado; Astra solo mejora 1.8 % sobre la media |
| Recalcular en `T-60` cuando hay alineación, portero o QB confirmado | Astra no lo hace (corre 24–72 h antes) | Ya tenemos el pick congelado a T-60; falta re-correr el modelo antes de congelar |

**No tomar:** IDs del proveedor como llave (usar `match_id` propio + tabla de mapeo, como ya hace `mappings.ts`), hotlinking de escudos, `select *` hacia el cliente, guardar `context` del modelo en tablas públicas, ni polling desde cada navegador.

## 2. Mejoras por motor (en orden de impacto)

### 2.1 Fútbol (Spacetime v3.x)
1. **Entrenar con xG por tiro de Bzzoiro** (gratis): reemplaza el xG estimado en ligas sin Understat, sobre todo Liga MX.
2. **Bajas reales por jugador** (`unavailable_players` de Bzzoiro) en vez de solo conteo: ponderar por minutos y xG+xA del jugador.
3. **Alineación confirmada a T-60** (Bzzoiro la trae ~1 h antes): enciende la ranura «Alineación confirmada» y re-corre el modelo antes de congelar el pick.
4. **Córners y tarjetas**: históricos de córners/tarjetas y sus líneas de Bet365 (5Dollar, todos los planes) + árbitros (Bzzoiro). Binomial Negativa condicionada a `λH − λA`. Publicar solo en ligas donde gane a la climatología fuera de muestra.
5. **Ancla de mercado sharp**: 5Dollar Ultra trae Pinnacle con apertura/cierre e historial tick desde 2014; sirve para CLV y para calibrar el blend. Con el plan gratis, Bet365 apertura/cierre ya permite medir CLV.
6. **Benchmark gratis**: Bzzoiro publica predicciones Dixon-Coles con ancla de mercado. Úsalas solo como rival a vencer en el backtest, nunca como entrada.

### 2.2 MLB (Kepler v3.0) · temporada inicia en marzo, hay tiempo de entrenar
Hoy da solo carreras esperadas y moneyline. Falta:
1. **Distribución de carreras** por tramo: abridor (`E[IP]` según su historial, soporta *openers*) y bullpen, con Binomial Negativa → abre F5, totales y run line.
2. **Extra innings**: si empatan en la 9.ª, sumar las carreras con corredor fantasma (Astra no lo hace y subestima los Overs 2.5–4 pp).
3. **FIP del bullpen separado** y fatiga del bullpen (lanzamientos de los últimos 3 días, del boxscore).
4. **Splits zurdo/derecho** del lineup contra la mano del abridor.
5. **Shrinkage** del pitcheo con poca muestra (`< 100 IP`) hacia xFIP/media de liga.
6. **Localía calibrada** (~53.5 %) en vez de 50/50 en duelos parejos.

### 2.3 NHL (Curvature v3.0)
1. Portero **confirmado** la mañana del juego y re-cálculo automático.
2. xG propio por tiro desde el play-by-play de `api-web.nhle.com` (coordenadas, tipo de tiro, `situationCode`).
3. Separar 5v5 / PP / PK, portería vacía y Monte Carlo para OT/SO.
4. Back-to-back y viaje.

### 2.4 NBA (Tensor v3.0)
1. **Descanso y back-to-back** (Astra lo tiene, nosotros no).
2. Bajas ponderadas por impacto del jugador (BPM/EPM × minutos) en lugar de −0.85 fijo por baja.
3. Bandera de incertidumbre cuando una estrella está *Questionable*.

### 2.5 Conexión pendiente
NBA, MLB, NHL y NCAAF ya predicen, pero **no salen como `MatchOutlook`** (solo fútbol y NFL). Ese cableado es lo primero, antes de cualquier mejora de modelo.

## 3. Fuentes: qué usar, con qué plan y para qué

| Fuente | Costo | Qué aporta | Uso comercial |
|---|---|---|---|
| **Bzzoiro** | $0 (Unlimited $5, WebSocket $7) | xG por tiro, alineaciones, bajas, árbitros, managers, stats de jugador, Liga MX, momio de consenso | Sí, para mostrar y entrenar; no redistribuir el dato crudo; escudos fuera de la licencia |
| **5DollarFootballAPI** | Free $0 · Pro $5 · Ultra $25 | Córners, tarjetas, stats de equipo, momios Bet365 apertura/cierre; Pro = Liga MX; Ultra = 20 casas + historial tick | Sí; en planes de $0 hay que mostrar «Football data by 5DollarFootballAPI» con enlace |
| **MLB Stats API** | $0, sin clave | Calendario, abridores probables, lineups, boxscore, play-by-play, splits, clima de estadio | Aviso de MLBAM: no comercial sin licencia → entrenar sí, mostrar en la app de pago no |
| **NHL Web API** | $0, sin clave | Calendario, play-by-play con coordenadas, porteros, standings | Mismo criterio que MLB |
| **ESPN público** (ya en uso) | $0 | Calendario, lesiones, momios DraftKings | API no documentada, sin licencia; ya está en `FREE_DATA_STRATEGY.md` |
| **nflverse** (ya en uso) | $0 | EPA, histórico NFL | CC-BY 4.0, comercial con atribución |
| **Open-Meteo** (ya en uso) | $0 | Clima | Gratis solo no comercial; para cobrar hay que pasar a su plan de pago (revisar precio vigente) |

**Qué comprar primero, si se compra algo:** 5Dollar **Pro ($5)** por Liga MX con córners, tarjetas y momios Bet365. Luego **Ultra ($25)** cuando haga falta el historial de Pinnacle para calibrar. Bzzoiro Unlimited ($5) solo si se quieren casas por nombre. API-Football ($19) ya no hace falta si 5Dollar + Bzzoiro cubren Liga MX.

## 4. MLB Stats API: qué pedir

No hay registro ni clave. No hay nada que pedir para entrenar. Para **mostrar** datos de MLB en la app de pago hay que pedir a MLB Advanced Media una licencia de datos, o comprar un proveedor con licencia (Sportradar, SportsDataIO). Mientras tanto, los datos de MLB solo alimentan el modelo; lo que ve el usuario es nuestra probabilidad y cuota justa (salida derivada).

Endpoints que usará el adaptador (base `MLB_STATSAPI_BASE_URL`, por defecto `https://statsapi.mlb.com/api`):

| Para qué | Endpoint |
|---|---|
| Calendario con abridores, lineups, clima y estadio | `/v1/schedule?sportId=1&date=AAAA-MM-DD&hydrate=probablePitcher,lineups,weather,venue,team` |
| Juego completo (boxscore, jugada a jugada, lanzamientos) | `/v1.1/game/{gamePk}/feed/live` |
| Boxscore ligero (fatiga del bullpen) | `/v1/game/{gamePk}/boxscore` |
| Stats de pitcher por temporada y splits vs zurdos/derechos | `/v1/people/{id}/stats?stats=season,statSplits&group=pitching&season=AAAA&sitCodes=vl,vr` |
| Bateo del equipo con splits | `/v1/teams/{id}/stats?stats=season,statSplits&group=hitting&season=AAAA&sitCodes=vl,vr` |
| Roster y lista de lesionados | `/v1/teams/{id}/roster?rosterType=40Man` y `/v1/transactions?startDate=…&endDate=…` |
| Standings | `/v1/standings?leagueId=103,104&season=AAAA` |

Reglas: una petición por segundo como máximo, caché en disco, `User-Agent` honesto (`PITCHLAB_DATA_USER_AGENT`) y nunca enlazar `mlbstatic.com` desde la app.

## 5. Recolección de históricos (hecho 2026-11-14)

`pnpm --filter @pitchlab/ingest history:providers` (código en `services/ingest/src/providers/`):

| Comando | Qué hace |
|---|---|
| `--provider=bzzoiro --leagues=liga-mx --seasons=3` | Partidos terminados con xG, tiros, córners, tarjetas, alineación confirmada y bajas (2 peticiones por partido) |
| `--provider=fivedollar --max-odds=40` | Partidos con córners y tarjetas (1 petición por liga) y momios de Bet365 apertura/cierre (1 por partido) |
| `--offline` | Reprocesa solo desde caché |

- Salida en `data/history/research/<proveedor>/<liga>.jsonl` + `manifest.json`; caché cruda en `data/history/raw/<proveedor>/`. Ambas ignoradas por Git (la licencia no permite redistribuir el dato crudo).
- Cada corrida suma a lo guardado: la ventana de 3 meses del plan gratis de 5Dollar se acumula si se corre al menos una vez al mes.
- 5Dollar gratis: ~55 peticiones por corrida, una por minuto; Liga MX se salta hasta tener Pro.
- Primera corrida: Liga MX Apertura y Clausura 2026 desde Bzzoiro, 310 partidos, 100 % con xG medido, alineación confirmada y 425 bajas; Premier League desde 5Dollar, 100 partidos con córners y tarjetas.

## 6. Emparejamiento y primer backtest (hecho 2026-11-14)

`pnpm --filter @pitchlab/ingest history:link` (código en `providers/link.ts`) empareja por fecha ±1 día y marcador, aprende el mapa de equipos del proveedor por mayoría de votos y hace una segunda pasada con ese mapa. No depende de que los nombres se parezcan («Querétaro FC» queda como `gallos-blancos`). Escribe, por `id` canónico: `research/provider-ids/`, `research/xg-bzzoiro/` (lo lee el backtest) y `research/match-context/` (bajas, córners, tarjetas y cierre Bet365).

| Liga | Emparejados | Nota |
|---|---|---|
| Liga MX (Bzzoiro 2024–2026) | 312 de 990 | Son **todos** los partidos que existen en el corpus para esas fechas: el corpus termina en mayo 2025 |
| Premier League (5Dollar) | 45 de 100 | Todos los del corpus, que termina el 20 sep 2026 |

**Hallazgo:** Bzzoiro solo **mide** xG en Liga MX desde el Apertura 2025; antes publica una estimación propia (`xg_estimated: true`). Como el corpus de Liga MX termina en mayo 2025, hoy no hay traslape con xG medido.

Backtest walk-forward Liga MX (781 partidos evaluados, `--include-research-history`, log loss 1X2, menor es mejor):

| Modelo | xG base (estimado por tiros ESPN, 53 partidos) | xG estimado por Bzzoiro (312 partidos) |
|---|---|---|
| Elo con xG | 1.0088 | 1.0062 |
| Mezcla con xG | 1.0038 | 1.0024 |
| Modelo actual (sin xG) | 1.0043 | 1.0043 |

Mejora pequeña y **no significativa** (el intervalo del bootstrap cruza 0). Comparar: `pnpm --filter @pitchlab/ingest backtest:history --leagues=liga-mx --include-research-history --xg-source=base|merged|merged-any`.

### Extensión research-only de Liga MX (hecho 2026-11-14)

openfootball no publica Liga MX 2021-22 a 2023-24 ni de 2025-26 en adelante (404), y tampoco las liguillas. `history:link` ahora genera `research/extended/liga-mx.jsonl` con los partidos de Bzzoiro que faltan, con el mismo formato e `id` del corpus (equipos traducidos con el mapa aprendido; fecha local de CDMX; liguilla numerada por fase). Son **1,550 partidos** (2020-21 a 2026-27). Viven fuera de Git y **no** entran al corpus publicable; el backtest los suma con `--extend-corpus`.

Backtest walk-forward Liga MX con extensión (**2,532 partidos** evaluados, log loss 1X2; Δ con IC 95 % de bootstrap pareado). Ojo: producción (`pipeline.ts`) **no** usa el Dixon-Coles solo, sino la **mezcla DC + Elo de goles 0.5/0.5** (`HISTORY_BLEND_WEIGHT`); esa es la referencia que importa.

| Modelo | Log loss | Δ contra DC solo | Δ contra la mezcla de producción |
|---|---|---|---|
| Dixon-Coles solo | 1.0259 | — | — |
| **Producción: DC + Elo de goles** | **1.0237** | −0.0022 [−0.0045, 0.0000] | — |
| DC + Elo de xG Bzzoiro | 1.0221 | −0.0039 [−0.0068, −0.0005] | −0.0017 [−0.0043, +0.0010] |
| (DC goles + DC xG) + Elo de xG | 1.0212 | −0.0048 [−0.0083, −0.0008] | −0.0025 [−0.0057, +0.0007] |

**Conclusión:** el xG de Bzzoiro le gana con claridad al Dixon-Coles solo, pero contra la mezcla que ya está en producción la mejora (−0.0017 a −0.0025) **todavía no es significativa**: el intervalo cruza 0. Con estos datos no se justifica cambiar producción. Dos cosas pueden volverla significativa: más partidos con xG **medido** (Bzzoiro mide Liga MX solo desde el Apertura 2025; hoy son 480) y sumar las ligas europeas, donde hay xG medido de varios años. Revisar de nuevo al cierre del Clausura 2027. El backtest ya reporta `deltaBlendXgVsBlend` y `deltaBlendDcMixVsBlend` para esta comparación.

Reproducir: `pnpm --filter @pitchlab/ingest history:providers --provider=bzzoiro --leagues=liga-mx --seasons=6`, luego `history:link` y `backtest:history --leagues=liga-mx --include-research-history --extend-corpus --xg-source=merged-any`.

### Premier League (hecho 2026-11-14)

Bzzoiro **mide** el xG de la Premier al menos desde 2021-22. Se bajaron 4 temporadas (2023-24 a 2026-27): 1,158 de 1,240 partidos emparejados con el corpus, todos con xG medido. Understat (`history:xg`, research-only) cubre 4,280 partidos (70 % del corpus).

Backtest walk-forward Premier League (**5,898 partidos** evaluados, log loss 1X2; Δ contra la mezcla de producción con IC 95 % de bootstrap pareado):

| xG usado | DC + Elo de xG | Δ contra producción (0.9726) | (DC goles + DC xG) + Elo de xG | Δ contra producción |
|---|---|---|---|---|
| Understat (4,280) | 0.9700 | **−0.0026 [−0.0046, −0.0005]** | 0.9698 | **−0.0028 [−0.0054, −0.0003]** |
| Solo Bzzoiro (1,158, 3 temporadas) | 0.9713 | **−0.0014 [−0.0022, −0.0005]** | 0.9710 | **−0.0016 [−0.0027, −0.0004]** |
| Understat + Bzzoiro encima | 0.9698 | **−0.0028 [−0.0049, −0.0008]** | 0.9696 | **−0.0030 [−0.0057, −0.0005]** |

**Conclusión:** en la Premier el xG sí le gana a la mezcla de producción de forma significativa, con cualquiera de las dos fuentes. Bzzoiro rinde igual que Understat donde coinciden (0.9698 contra 0.9700) y tiene dos ventajas: su licencia permite uso comercial de las salidas derivadas (Understat es research-only) y cubre Liga MX. Con solo 3 temporadas ya es significativo; el efecto crecerá con más temporadas.

### En producción (hecho 2026-11-14)

- `services/ingest/src/xg-feed.ts` arma una búsqueda de xG **medido** por fecha (±1 día) y equipos, con los mismos ids del pipeline (`remapTeam`). Solo las ligas de `XG_ELO_LEAGUES` (hoy `premier-league`) la usan.
- `pipeline.ts` → `buildHistoryRatings(..., xgLookup)`: cada partido con xG actualiza el Elo de largo plazo con su xG en vez de goles; el resto sigue con goles. La mezcla 1X2 queda **DC + Elo de xG 0.5/0.5**, la variante validada en el backtest.
- `pre-mvp-snapshot.yml` restaura la caché de `data/history/raw/bzzoiro`, corre `history:providers` (Premier, 4 temporadas, máx. 1,500 peticiones por corte) y `history:link` antes del corte, y guarda la caché. El primer corte baja la mitad; el segundo completa.
- **Requiere** el secreto `BZZOIRO_API_KEY` en GitHub Actions. Sin él, o si Bzzoiro falla, el pipeline sigue con Elo de goles sin romperse.
- Verificado con datos reales: los 1,158 partidos del corpus desde 2023-24 encuentran su xG con los ids del pipeline.

## 7. Texto de IA con validación de coherencia (hecho 2026-11-14)

`apps/web/src/server/cortex.ts` ya rechazaba números inventados. Ahora también rechaza lo que Astra publicó: favorito invertido, porcentaje atribuido al rival, local/visitante invertidos, muletillas de chat («perdón», «el JSON») y lenguaje de apuesta segura. Los datos que recibe el LLM llevan roles explícitos (`local` / `visitante`). Si el texto falla, se publica la plantilla determinista.

## 8. NBA y NHL (motor nuevo, 2026-11-14)

**Hallazgo:** NBA y NHL no existen en la app. Las predicciones de Spacetime para esos deportes no sirven tal cual: partidos sin fecha (`kickoff_utc: null`) y mercado de relleno 50/50.

**Datos:** Bzzoiro tiene NBA (liga `1`) y NHL (liga `65`) con calendario, resultados, hora real, posiciones y momios de 16 casas por nombre; licencia comercial; 100 peticiones al día por deporte gratis (Sports Pack US$7/mes sin tope). Historia: NBA 2024-25, 2025-26 y en curso; NHL 2025-26 y en curso. `pnpm --filter @pitchlab/ingest history:us` (~20 peticiones por deporte). Ojo: el filtro es `league`, no `league_id`.

**Motor** (`packages/models/src/us-sports/ratings.ts`): ratings de ataque/defensa incrementales con regresión entre temporadas, localía, altitud (Denver, Utah), descanso y back-to-back. NBA → Normal sobre el margen; NHL → Poisson de goles de **tiempo regular** (se quita el gol de tiempo extra/penales, error de Astra) y el empate se resuelve aparte.

**Backtest** (`pnpm --filter @pitchlab/ingest backtest:us`; parámetros elegidos solo en el tramo de ajuste; log loss del ganador):

| | NBA (1,505 partidos, oct 2025 → nov 2026) | NHL (1,005 partidos, ene → nov 2026) |
|---|---|---|
| Tasa de local | 0.6879 | 0.6920 |
| Ratings | **0.5981** | 0.6727 |
| Ratings + descanso/back-to-back | 0.6004 | **0.6703** |
| Elo que publica Bzzoiro | — | 0.6960 |
| Δ ratings+descanso contra tasa de local | −0.0876 [−0.1086, −0.0669] | −0.0216 [−0.0340, −0.0096] |
| Δ contra sin descanso | +0.0022 [−0.0024, +0.0069] | −0.0024 [−0.0066, +0.0018] |
| Δ contra Elo de Bzzoiro | — | −0.0257 [−0.0410, −0.0106] |

**Conclusión:** el motor nuevo es sólido en ambos deportes y en NHL le gana con claridad al Elo de Bzzoiro. El ajuste por descanso/back-to-back que tiene Astra **no** mejora de forma significativa fuera de muestra con esta historia: en NBA se publica sin él; en NHL queda dentro porque no empeora. Falta la vara importante: el **mercado** (momios de cierre). Bzzoiro los da por partido (1 petición cada uno), así que se medirá con el plan de pago o juntando la temporada en curso día a día.

**Para meter NBA y NHL a la app** (siguiente fase):
1. `LeagueId` en `@pitchlab/contracts`, escudos propios en `@pitchlab/sports-assets` (sin hotlinking), y ligas en la navegación.
2. Corte diario en `cli.ts`: calendario y resultados de Bzzoiro → ratings → snapshot `data/snapshots/nba|nhl/latest.json` con moneyline, spread/puck line y totales (cuota justa `1/p`).
3. Momios del día de Bzzoiro (16 casas) para la comparación con mercado y la medición de CLV.
4. Bajas de NBA/NHL (ESPN, research-only, ya hay adaptador de bajas) y portero confirmado de NHL.
5. Fichas de partido y tarjetas con el lenguaje de la app (stories en ambos temas).

## 10. Córners, faltas y amarillas (motor nuevo, 2026-11-14)

Astra publica córners y faltas esperados; nosotros no teníamos ese modelo. Ahora sí, y validado.

- **Modelo** (`packages/models/src/football/counts.ts`): ratings log-lineales por equipo, una de lo que *genera* (córners a favor, faltas cometidas, amarillas recibidas) y otra de lo que *concede* al rival, sobre la media de la liga por lado (EWMA), con regresión entre temporadas. Se actualizan partido a partido con el error relativo acotado. Distribución binomial negativa por momentos (córners `r≈13`, faltas `r≈151`; amarillas sin sobredispersión → Poisson).
- **Datos** (research-only, fuera de Git): football-data.co.uk para las 5 ligas europeas desde 2010-11 (~29 mil partidos con córners, faltas y amarillas; `history:odds` ahora lee `HF`/`AF`) y Bzzoiro para Liga MX (~480 partidos con córners y faltas, ~2 mil con amarillas).
- **Backtest** (`pnpm --filter @pitchlab/ingest backtest:counts` → `Reportes/modelos/BACKTEST-CORNERS-FOULS.json`). Parámetros elegidos solo con las temporadas europeas 2010-11…2017-18, compartidos entre ligas; evaluación 2018-19 en adelante contra la media de la liga sin ratings de equipo (pérdida = −log-verosimilitud del total; Δ negativo = mejora):

| Conteo | Europa (n=14,784) Δ [IC 95 %] | MAE total modelo vs base | Liga MX Δ [IC 95 %] |
|---|---|---|---|
| Córners | −0.012 [−0.014, −0.010] | 2.66 vs 2.68 | −0.008 [−0.020, +0.003] (n=380, no significativo) |
| Faltas | −0.065 [−0.071, −0.058] | 4.16 vs 4.45 | −0.057 [−0.088, −0.025] |
| Amarillas | −0.014 [−0.017, −0.012] | 1.62 vs 1.65 | −0.007 [−0.013, −0.002] |

  Los córners mejoran poco: son ruidosos para cualquier modelo (también para Astra). Las faltas son donde más pesa el estilo del equipo.
- **Producción** (`services/ingest/src/counts-feed.ts`): cada análisis de fútbol nuevo trae `counts` (esperado por equipo, total, línea equilibrada con .5 y probabilidad del más), un grupo de mercado por conteo y un factor legible. Solo se publica si ambos equipos tienen al menos 5 partidos con ese dato: nunca se rellena con promedios. No entra a picks, 1X2 ni confianza. El workflow descarga football-data.co.uk (5 temporadas, ~25 CSV por corte) y 2 torneos de Liga MX de Bzzoiro (tope 600 peticiones; la caché evita repetir). Si falla, el análisis sale sin conteos.
- **Ejemplo** Querétaro–Monterrey (14 nov): córners 5.4–5.3 (10.8), faltas 11.8–10.1 (22.0). Astra publicó 5.1–5.5 (10.6) y 11.8–10.3 (22.1).
- **Pendiente:** árbitro como variable de faltas y tarjetas (football-data.co.uk lo trae solo en la Premier; Bzzoiro trae `refereeId`), y comparar contra la línea de córners de cierre de Bet365 (5Dollar, plan Pro).

## 11. Cortex IA por secciones en el corte (2026-11-14)

Antes la ficha llamaba al LLM en cada visita (caché en memoria que se perdía en cada arranque). Ahora:

- **Una llamada por partido, en el corte** (`pnpm --filter @pitchlab/ingest cortex:write`, paso «Cortex IA» del workflow): partidos de fútbol por jugar de los próximos 4 días que aún no tienen texto. Tope de 60 llamadas por corrida. La ficha lee `analyses[id].cortex` del snapshot: cero llamadas por visita.
- **Huella de datos** (`fingerprint`): si los datos de entrada no cambian, no se vuelve a llamar. Como el análisis publicado se congela antes del inicio, en la práctica es una sola llamada por partido.
- **Lectura propia, no copia de Astra:** un titular con la idea central, «La lectura» (se escribe con la animación de Cortex), y tarjetas «Goles», «Ritmo del partido» (córners, faltas y amarillas leídos juntos), «Tabla y descanso» y «Qué podría cambiarlo» (aviso con borde punteado). Cada tarjeta trae su evidencia al lado del texto: barras local/visitante y cifras clave que salen del motor (`stats`), nunca del LLM. Al pie, «Cómo se escribió esta lectura» explica la verificación y cuántas secciones usan el texto directo. Voz de analista que explica el porqué, sin frases hechas.
- **El LLM solo redacta:** recibe probabilidades, goles esperados, más de 1.5/2.5, ambos anotan, conteos, tabla y descanso. Cada sección pasa el validador compartido (`packages/contracts/src/cortex.ts`: números respaldados, sin proveedores ni algoritmos, sin muletillas, sin lenguaje de apuesta, favorito y local/visitante sin invertir). Sección rechazada → plantilla con los mismos números (`origin: "plantilla"`). Si OpenRouter falla, no se guarda nada y el siguiente corte reintenta.
- **Configuración:** secreto `OPENROUTER_API_KEY` en GitHub Actions; variables opcionales `OPENROUTER_MODEL` (por defecto `deepseek/deepseek-v4.1-flash-1017`), `OPENROUTER_PROVIDER` y `PITCHLAB_AI_ENABLED=0` para apagarlo. Revisar los datos sin gastar: `cortex:write --dry-run`.

## 9. Siguientes pasos

1. Cargar `BZZOIRO_API_KEY` como secreto de GitHub Actions para encender el xG en producción.
2. NBA y NHL a la app (§8).
3. Bajar más temporadas de la Premier y las otras 4 ligas europeas (la cuota diaria de Bzzoiro alcanza para ~1 liga y 4 temporadas por día) y repetir la comparación por liga.
4. Añadir bajas (`match-context`) como variable del modelo y medirla en el backtest.
5. MLB: distribución de carreras, entradas extra, F5 y run line antes de marzo.
6. Árbitro en faltas y tarjetas (§10).
7. ✅ Análisis de IA por secciones en el corte (§11). Falta cargar `OPENROUTER_API_KEY` en GitHub Actions.
