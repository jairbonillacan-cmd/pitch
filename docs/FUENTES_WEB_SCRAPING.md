# Catálogo y Arquitectura de Fuentes de Web Scraping (`web-scraping`)

> **Rama:** `web-scraping` (`.worktrees/web-scraping`)
> **Motor obligatorio:** **Scrapling `v0.5.1`** ([`Scrapling/`](../Scrapling/README.md) · [`SKILL.md`](../Scrapling/agent-skill/Scrapling-Skill/SKILL.md))
> **Configuración estructurada:** [`config/sources_catalog.json`](../config/sources_catalog.json)

---

## 1. Diagnóstico: ¿Qué le falta hoy a los modelos de PitchLab?

Los resultados del laboratorio (`prediction-lab`, ciclos 1–10) y del backtest de `packages/models` (v2) muestran que los modelos entrenados únicamente con marcadores históricos, tiros y Elo baten a los baselines heurísticos, pero **pierden contra la cuota de cierre del mercado por ~0.019–0.020 de log-loss en fútbol y ~0.032 en NFL**.

Las 5 brechas de información que explican esa diferencia son:
1. **Falta de cuotas con timestamp (`captured_at_utc`) y eliminación de Pinnacle en 2026/27:** `football-data.co.uk` quitó Pinnacle en 2026/27 y no guarda hora de captura.
2. **Ceguera estadística en Liga MX (`new/MEX.csv`):** Solo tiene marcador final y cuota 1X2 de cierre; carece por completo de xG, xA, tiros, córners, tarjetas, alineaciones y árbitro.
3. **Bloqueos Cloudflare (403) con `curl` convencional:** Sitios clave de estadísticas avanzadas devolvieron `403 Just a moment...` al usar clientes HTTP tradicionales.
4. **Ausencia de lesiones, sanciones y alineaciones confirmadas (T-60m):** El mercado ajusta su línea en segundos cuando un QB titular en NFL o un delantero/portero titular en Liga MX o Premier League queda fuera.
5. **Falta de señales de microestructura de mercado, noticias y clima:** *Public betting splits* (`% tickets` vs `% dinero sharp`), partes médicos de ruedas de prensa, altitud/clima a la hora del kickoff y rigor arbitral.

---

## 2. Reglas Obligatorias de Ingeniería

> [!IMPORTANT]
> **Regla 1 — Uso Exclusivo de Scrapling (`v0.5.1`):**
> Todo scraper en esta rama **DEBE** construirse sobre [`scrapers/base_scraper.py`](../scrapers/base_scraper.py) usando exclusivamente **Scrapling** desde `.worktrees/web-scraping/.venv`:
> - **Prohibido** usar `requests`, `urllib`, `httpx`, `curl`, `BeautifulSoup` o `playwright` suelto fuera de Scrapling.
> - En llamadas por CLI (`scrapling extract`), incluir **siempre** `--ai-targeted` para limpiar elementos ocultos, bloquear anuncios y proteger contra prompt injection.
> - Activar el parser adaptativo (`adaptive=True` / `auto_save=True`) en selectores CSS/XPath críticos.

> [!WARNING]
> **Regla 2 — Trazabilidad y Anti-Leakage (`captured_at_utc <= predicted_at`):**
> Todo archivo guardado en `data/raw/` incluye un sobre de metadatos con `captured_at_utc` (ISO-8601 UTC) y el hash `sha256` del contenido crudo. Ningún dato con `captured_at_utc > predicted_at` puede utilizarse en backtests walk-forward.

---

## 3. Los 5 Modos de Extracción con Scrapling

1. **`fetcher_session` (`FetcherSession`)**: Impersonación de huella TLS de Chrome (`impersonate="chrome"`), cabeceras stealth (`stealthy_headers=True`) y soporte HTTP/3 (`http3=True`) para sitios rápidos sin challenge interactivo.
2. **`stealthy_session` (`StealthySession`)**: Automatización completa con resolución automática de Cloudflare Turnstile (`solve_cloudflare=True`), `network_idle=True` y bloqueo de anuncios (`block_ads=True`).
3. **`network_recorder` (`AsyncStealthySession(record_requests=True)`)**: Captura directa de respuestas JSON/XHR internas mediante `session.network.search(url_pattern=...)` (ideal para **Opta Player Stats**, **Statiskicks**, **Sofascore**, **FotMob**, **Pinnacle** y **Caliente.mx**).
4. **`spider` (`Spider` / `CrawlSpider`)**: Crawls concurrentes multi-sesión con `crawldir` para pausa/reanudación y `autothrottle_enabled=True`.
5. **`cli_ai_targeted` (`scrapling extract ... --ai-targeted`)**: Conversión directa de portales de noticias y ruedas de prensa a Markdown limpio.

---

## 4. Lista Maestra de Sitios para Web Scraping

### Categoría 1: Casinos, Casas de Apuestas y Agregadores de Cuotas (`odds_casinos`)

| ID | Sitio Web | Ligas | Qué aporta al modelo | Modo Scrapling | Prioridad |
|---|---|---|---|---|---|
| `pinnacle` | **Pinnacle** (`https://www.pinnacle.com/`) | Todas (Liga MX, EPL, LaLiga, Serie A, Bundesliga, Ligue 1, NFL, NHL, MLB) | Benchmark *sharp* mundial (margen ~2%, ausente en `football-data` 2026/27). Probabilidad sin vig, líneas asiáticas, totales y límite máximo. | `network_recorder` (`guest.api.arcadia.pinnacle.com`) | **P0** |
| `caliente_mx` | **Caliente.mx** (`https://sports.caliente.mx/`) | **Liga MX**, Fútbol Europeo, NFL, MLB, NHL | Cuotas del mercado líder en México (1X2, O/U 2.5, BTTS, Props). Detecta sesgo de afición local en equipos populares de Liga MX vs Pinnacle. | `network_recorder` (`AsyncStealthySession`) | **P0** |
| `codere_bet365_mx` | **Codere México / Playdoit / Bet365** (`https://www.codere.mx/`) | Liga MX, LaLiga, EPL, NFL | Dispersión de precios entre casas recreacionales y líneas sharp. | `stealthy_session` (`solve_cloudflare=True`) | **P1** |
| `oddsportal_oddschecker` | **OddsPortal / Oddschecker** (`https://www.oddsportal.com/`) | 23+ ligas de fútbol, NFL, NHL, MLB | Serie temporal de movimientos de cuota con timestamp exacto (apertura → movimientos → cierre) de >15 casas. | `network_recorder` (`solve_cloudflare=True`) | **P0** |
| `action_network_splits` | **Action Network / VegasInsider / Covers** (`https://www.actionnetwork.com/nfl/public-betting`) | **NFL**, NCAAF, NHL, MLB, EPL | **Public Betting Splits:** `% de tickets` (público) vs `% de dinero` (*sharp money*) y *Reverse Line Movement*. | `fetcher_session` (`script#__NEXT_DATA__`) | **P0 (NFL)** |
| `betfair_smarkets_exchange` | **Betfair Exchange / Smarkets** (`https://smarkets.com/`) | EPL, LaLiga, Champions, NFL | Precios de intercambio sin vig y volumen real de liquidez ($) por mercado. | `fetcher_session` (`impersonate="chrome"`) | **P1** |

---

### Categoría 2: Sitios de Datos Estadísticos Avanzados (`advanced_stats_xg`)

| ID | Sitio Web | Ligas | Qué aporta al modelo | Modo Scrapling | Prioridad |
|---|---|---|---|---|---|
| `opta_player_stats` | **Opta Player Stats — Stats Perform** (`https://optaplayerstats.statsperform.com/`) | **Liga MX**, EPL, LaLiga, Bundesliga, Serie A, Ligue 1, Champions | **Fuente oficial Opta (estándar de liquidación de Bet365/SkyBet):** estadísticas granulares por jugador y equipo (disparos, tiros a puerta, `opta_xg`, `opta_xa`, pases clave, entradas/tackles, intercepciones, faltas, duelos ganados, tarjetas y minutos). | `network_recorder` interceptando `api.performfeeds.com/soccerdata/...` | **P0** |
| `statiskicks` | **Statiskicks** (`https://www.statiskicks.com/`) | **Liga MX (Fase Regular y Liguilla)**, Expansión MX, Selección Mexicana y ligas top | **Referencia #1 en analítica avanzada del fútbol mexicano:** `xG`, `xA`, `xP` (Puntos Esperados), pases progresivos y rompe-líneas, entradas al último tercio, radiografías tácticas de clubes y percentiles por rol/jugador. | `network_recorder` (`AsyncStealthySession`) + soporte `RemoteSession` vía CDP para `/plataforma` | **P0 (MX)** |
| `sofascore` | **Sofascore** (`https://www.sofascore.com/`) | **Liga MX**, EPL, LaLiga, Bundesliga, Serie A, Ligue 1, NFL | `xG` por partido y disparo, grandes ocasiones creadas/falladas, tiros dentro del área, córners, ratings de titulares y mapa de tiros. | `network_recorder` (`api.sofascore.com/api/v1/event/...`) | **P0** |
| `fotmob` | **FotMob** (`https://www.fotmob.com/`) | **Liga MX**, 5 grandes ligas europeas | `xG`, `xGOT` (xG a puerta), `xG` en jugada abierta vs balón parado y `PPDA` (intensidad de presión). | `network_recorder` (`fotmob.com/api/matchDetails`) | **P0** |
| `fbref` | **FBref** (`https://fbref.com/`) | Liga MX, EPL, LaLiga, Serie A, Bundesliga, Ligue 1 | `NPxG`, `PSxG` (evaluación de porteros), acarreos/pases progresivos y acciones de creación de tiro (`SCA`/`GCA`). | `stealthy_session` (`solve_cloudflare=True`) | **P0** |
| `understat` | **Understat** (`https://understat.com/`) | EPL, LaLiga, Bundesliga, Serie A, Ligue 1 | Histórico de `xG`, `NPxG`, `xPTS`, `PPDA` y `Deep Completions` desde 2014/15. | `fetcher_session` (`impersonate="chrome"`) | **P1** |
| `clubelo_transfermarkt_values` | **ClubElo & Transfermarkt** (`https://www.transfermarkt.mx/`) | Fútbol Europeo y Liga MX | Valor de mercado (€) de cada plantilla y edad media; resuelve los priors `S-1` de equipos recién ascendidos. | `fetcher_session` (`adaptive=True`) | **P1** |
| `pfr_rbsdm_sumersports` | **Pro-Football-Reference / RBSDM / SumerSports** (`https://www.pro-football-reference.com/`) | **NFL** | EPA/play ajustado, Success Rate, CPOE, *Pressure Rate*, *Time to Throw* y eficiencia en Red Zone. | `stealthy_session` (`solve_cloudflare=True`) | **P1 (NFL)** |

---

### Categoría 3: Sitios de Lesiones, Suspensiones y Alineaciones (`injuries_lineups`)

| ID | Sitio Web | Ligas | Qué aporta al modelo | Modo Scrapling | Prioridad |
|---|---|---|---|---|---|
| `transfermarkt_injuries` | **Transfermarkt Lesiones y Sanciones** (`https://www.transfermarkt.mx/`) | **Liga MX**, EPL, LaLiga, Bundesliga, Serie A, Ligue 1 | Jugadores lesionados/suspendidos con su **valor de mercado (€)** para calcular `missing_market_value_ratio`. | `fetcher_session` (`table.items tbody tr`) | **P0** |
| `premierinjuries_sportsgambler` | **PremierInjuries & SportsGambler** (`https://www.sportsgambler.com/injuries/football/`) | Liga MX y 5 grandes ligas europeas | Probabilidad de retorno (`25%`, `50%`, `75%`, `Out`), partidos perdidos y XI probable. | `fetcher_session` (`impersonate="chrome"`) | **P0** |
| `rotowire_lineups_injuries` | **RotoWire Lineups & Injuries** (`https://www.rotowire.com/soccer/lineups.php`) | **Liga MX**, 5 grandes ligas europeas, **NFL** | Alineaciones probables (T-24h) y confirmadas (T-60m) + reporte de lesionados/dudas. | `fetcher_session` (`.lineup__box`) | **P0** |
| `nfl_official_injuries_depth` | **NFL Official Injury Report & Ourlads Depth Charts** (`https://www.nfl.com/injuries/`) | **NFL** | Parte médico oficial (Mié/Jue/Vie `DNP`/`LP`/`FP`), designación (`Out`/`Doubtful`/`Questionable`), inactivos T-90m y *Depth Charts* completos. | `stealthy_session` (`solve_cloudflare=True`) | **P0 (NFL)** |

---

### Categoría 4: Sitios de Noticias Deportivas y Ruedas de Prensa (`news_press_sentiment`)

| ID | Sitio Web | Ligas | Qué aporta al modelo | Modo Scrapling | Prioridad |
|---|---|---|---|---|---|
| `mediotiempo_record_mx` | **Mediotiempo / Récord** (`https://www.mediotiempo.com/futbol/liga-mx`) | **Liga MX** | Bajas de última hora, rotaciones por doble jornada o Concachampions, sanciones disciplinarias y cambios de DT. | `cli_ai_targeted` (`--ai-targeted`) | **P1 (MX)** |
| `ffs_bbc_press_conferences` | **Fantasy Football Scout / BBC Sport** (`https://www.fantasyfootballscout.co.uk/team-news/`) | Premier League | Resumen estructurado de las ruedas de prensa de los entrenadores cada viernes (*Team News*). | `cli_ai_targeted` (`--ai-targeted`) | **P1 (EPL)** |
| `marca_as_laliga_news` | **Marca / Diario AS** (`https://www.marca.com/futbol/primera-division.html`) | LaLiga | Convocatorias oficiales, partes médicos de clubes españoles y onces probables de cronistas. | `cli_ai_targeted` (`--ai-targeted`) | **P1 (ESP)** |
| `profootballtalk_nfl_news` | **ProFootballTalk (NBC) & NFL.com News** (`https://www.nbcsports.com/nfl/profootballtalk`) | **NFL** | Noticias de *snap count limits*, cambios de coordinador ofensivo/defensivo y titulares de campamento. | `cli_ai_targeted` (`--ai-targeted`) | **P1 (NFL)** |

---

### Categoría 5: Contexto Ambiental, Estadios y Arbitraje (`environment_referees`)

| ID | Sitio Web | Ligas | Qué aporta al modelo | Modo Scrapling | Prioridad |
|---|---|---|---|---|---|
| `open_meteo_nflweather` | **Open-Meteo & NFLWeather** (`https://api.open-meteo.com/v1/forecast`) | **NFL**, **Liga MX**, Fútbol Europeo | Viento (mph), ráfagas, precipitación, temperatura y altitud a la hora exacta del kickoff (clave para Over/Under en NFL y choque de altitud en Liga MX). | `fetcher_session` | **P0** |
| `worldfootball_nflpenalties_referees` | **WorldFootball & NFLPenalties** (`https://www.worldfootball.net/`) | Fútbol Europeo, Liga MX, NFL | Designación arbitral previa al partido y promedios históricos de tarjetas, penales, faltas y yardas de castigo (Holding/DPI en NFL). | `fetcher_session` (`adaptive=True`) | **P1** |
