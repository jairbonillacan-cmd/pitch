# Inventario técnico de fuentes gratuitas de datos deportivos — Hockey y Fútbol Americano Colegial

**Fecha de investigación:** 2026-11-08
**Alcance:** exclusivamente investigación y documentación de fuentes. No incluye código, integraciones ni modelos.
**Método de verificación:** cada fuente fue comprobada por HTTP (curl, cabeceras de respuesta), lectura de sus páginas de documentación/términos y referencias comunitarias. Los códigos HTTP observados se indican donde aplica. **Los términos legales citados corresponden a la fecha de este reporte; conviene reverificarlos antes de firmar contratos o lanzar producto.**

---

## 0. Resumen ejecutivo

| Deporte | Fuente núcleo recomendada | ¿Gratis de verdad? | ¿Uso comercial permitido? | Principal limitación |
|---|---|---|---|---|
| NHL | NHL Web API (`api-web.nhle.com`) | Sí (sin key) | ⚠️ Gris: ToS de la NHL prohíbe acceso automatizado no autorizado | API no oficialmente documentada; xG no incluido |
| NHL — xG/tiros | MoneyPuck (CSV descargables) | Sí | ❌ Solo no comercial + atribución; scraping requiere aprobación previa | No usable en producto comercial sin permiso |
| NHL — historial | Hockey-Reference / Natural Stat Trick | Sí (navegación) | ❌ Sports-Reference exige licencia para uso comercial; NST sin términos formales + Cloudflare | Solo consulta manual o scraping restringido |
| Otras ligas (AHL/ECHL/CHL/USHL/PWHL) | HockeyTech (`lscluster.hockeytech.com`) | Informalmente sí | ⚠️ No es API pública; sin garantía de continuidad | Endpoints no oficiales, pueden bloquear |
| NCAA FBS/FCS | **CollegeFootballData.com (CFBD)** | Sí (key gratuita) | ✅ **Sí, explícitamente permitido en cualquier tier** | Tier gratuito: 1.000 llamadas/mes; sin datos en vivo |
| NCAA — volumetría | ESPN hidden API (`site.api.espn.com`) | Sí (sin key) | ⚠️ Uso no comercial implícito | No documentada; cambios sin aviso |
| NCAA — ratings | WarrenNolan.com (Elo), FiveThirtyEight repo | Sí | ⚠️ WarrenNolan sin términos explícitos | Sin API estructurada (HTML) |

**Conclusión clave:** para un producto comercial, la única fuente grande con permiso comercial **explícito y gratuito** es **CollegeFootballData.com**. En hockey, la API de la NHL es la base de facto de todo el ecosistema de analítica, pero su uso automatizado formalmente viola los ToS de la NHL — es el riesgo estándar asumido por casi toda la industria de analítica; debe registrarse como riesgo legal conocido. MoneyPuck, Sports-Reference y Elite Prospects no son opciones comerciales gratuitas.

---

## 1. Catálogo — Hockey sobre hielo

### 1.1 NHL Web API oficial (no documentada) — `api-web.nhle.com` + `api.nhle.com/stats/rest`

- **URL base:** `https://api-web.nhle.com/v1/...` · `https://api.nhle.com/stats/rest/{lang}/...`
- **Documentación de facto:** [Zmalski/NHL-API-Reference (GitHub)](https://github.com/Zmalski/NHL-API-Reference) (repo con licencia MIT, documenta ambos bases; verificado HTTP 200)
- **Verificación de enlace:** `GET https://api-web.nhle.com/v1/schedule/2026-11-08` → HTTP 200 ✅
- **Competiciones:** NHL (temporada regular + playoffs). Las dos APIs alimentan NHL.com y las apps oficiales.
- **Cobertura histórica:**
  - Calendario/resultados por fecha: profundidad alta (consultable por fecha; verificado para temporadas recientes). La API antigua `statsapi.web.nhl.com` fue apagada en 2023–2024; algunos endpoints del nuevo API alcanzan temporadas anteriores vía `season`/rosters históricos.
  - Play-by-play estructurado (con coordenadas XY de jugadas): ~2009–2010 en adelante, con mejor granularidad en temporadas recientes.
- **Datos disponibles (mapeados a nuestra lista de requisitos):**
  - Calendarios y resultados ✅ (`/v1/schedule/{fecha}`, `/v1/score/{fecha}`)
  - Boxscore completo ✅ (`/v1/gamecenter/{gameId}/boxscore`): goles por periodo, tiros, hits, bloqueos, PIM, faceoffs ganados/perdidos, PP/PK, TOI por jugador
  - Play-by-play ✅ (`/v1/gamecenter/{gameId}/play-by-play`): eventos con tipo, jugadores involucrados, situación (5v5, PP, PK, vacío), coordenadas en pista
  - Shift charts ✅ (`api.nhle.com/stats/rest/en/shiftcharts?gameId=...`) → base para tiempo sobre hielo real y combinaciones de líneas
  - Porteros ✅: saves/tiros por situación en boxscore y PBP → derive de porcentaje de atajadas, incl. alta peligrosidad
  - Estadísticas individuales ✅ (`/v1/player/{id}/landing`, game logs, leaders; reports filtrables en `/stats/rest`)
  - Alineaciones/rosters ✅ (rosters actuales y históricos, `/v1/roster/{equipo}/{temporada}`)
  - Lesiones ❌ (no hay endpoint estructurado)
  - Resultados casa/visitante ✅ (derivable del schedule + boxscore)
  - Expected Goals (xG) ❌ **no lo provee la NHL** — hay que calcularlo (ver §1.2 MoneyPuck para metodología/datos de referencia)
  - NHL EDGE ✅ (`/v1/edge/...`): velocidad, distancia patinada, zona, velocidad de tiro — datos de tracking oficial, gratis
  - Draft, prospects ✅, standings ✅, carrousels de playoffs/bracket ✅
  - **Historial de temporadas anteriores:** sí para la mayoría de endpoints recientes; registros profundos (1917+) viven más en Hockey-Reference que en el API.
- **En vivo:** sí — la comunidad confirma que el PBP se actualiza en partido (es el feed de NHL.com).
- **Frecuencia de actualización:** segundos/minutos durante partidos en vivo; nocturna para datos agregados.
- **Formato:** JSON. Existe WADL público enlazado desde el repo de Zmalski (el endpoint OpenAPI devuelve 404).
- **Autenticación:** **ninguna** — GET sin key.
- **Límites:** no documentados; hay rate limiting blando/IP blocking en la práctica. Norma comunitaria: ≤1 req/seg, caching agresivo.
- **Condiciones de uso comercial:** ⚠️ [NHL.com Terms of Service](https://www.nhl.com/info/terms-of-service) y NHL Hockeyverse prohíben explícitamente el acceso automatizado no autorizado y el scraping; las alimentaciones comerciales de datos NHL se licencian vía partners (Sportradar, SMT). **Riesgo legal real para uso comercial automatizado** — asumido de facto por casi todo el ecosistema de analítica open source, pero debe quedar documentado como riesgo.
- **Descarga/almacenamiento:** técnicamente trivial; legalmente sujeto al ToS anterior.
- **Calidad/completitud:** excelente (es la fuente oficial de la liga). Riesgo de breaking changes: la migración 2023 ya rompió todo el ecosistema una vez.
- **Utilidad:** ★★★★★ como backbone técnico; ★★☆☆☆ desde la perspectiva legal-comercial.

### 1.2 MoneyPuck.com — datos descargables con xG

- **URL:** [moneypuck.com/data.htm](https://moneypuck.com/data.htm) (verificado HTTP 200 ✅)
- **Competiciones:** NHL.
- **Cobertura histórica:** 2.079.359 tiros, temporadas **2007-08 → 2025-26** (temporada 2026-27 se actualiza cada noche); resúmenes de temporada por jugador/portero/línea/equipo desde **2008-09**; archivo comprimido 2008–2024; game-by-game combinado (`all_teams.csv`) todas las temporadas.
- **Datos disponibles:**
  - Tiros (SOG, fallados, goles; bloqueados excluidos) con **124 atributos por tiro**: tirador, portero, ángulo, distancia, eventos previos al tiro, TOI de los presentes
  - **xG por tiro** + prob. de rebote, prob. de fallo, prob. de congelación del disco (modelo propio documentado)
  - Coordenadas ajustadas por arena (método War-On-Ice/Schuckers-Curros)
  - Diccionarios de datos (CSV) para game data y shot data
- **En vivo:** no como archivo (los live odds viven en la web, no en descargas).
- **Frecuencia:** diaria (temporada actual); histórica congelada.
- **Formato:** CSV / ZIP de CSVs.
- **Autenticación:** ninguna.
- **Límites:** sin límite técnico declarado para los archivos listados; **scraping de cualquier cosa no listada requiere aprobación previa por email**; scraping no aprobado será bloqueado.
- **Condiciones de uso comercial:** ❌ **«Free for non-commercial purposes» + atribución obligatoria («clearly credit MoneyPuck.com»)**; otros usos requieren consulta por email. **No usable en producto comercial sin permiso explícito.**
- **Descarga:** sí, completa (archivos estáticos).
- **Calidad:** alta; es el estándar de facto de xG NHL junto con Natural Stat Trick y Evolving-Hockey (este último de pago).
- **Utilidad:** ★★★★★ para I&D interno, calibrar/validar nuestro propio modelo de xG; ★☆☆☆☆ como insumo directo de producto comercial.

### 1.3 Natural Stat Trick (NST)

- **URL:** [naturalstattrick.com](https://www.naturalstattrick.com/games.php) (verificado HTTP 200 ✅ con navegador; curl directo recibe challenge de Cloudflare)
- **Competiciones:** NHL (equipo, línea, jugador; por situación de juego).
- **Cobertura histórica:** tablas de equipo desde **2007-08**; datos por juego desde **2009-10** aprox. (comprobado: la tabla de 2006-07 no existe; 2007-08 sí).
- **Datos:** Corsi/Fenwick/xG (propio modelo), tiro, zonas, spawn zones; desgloses 5v5/PP/PK/4v4/3v3; reports por juego con PBP enriquecido.
- **En vivo:** datos post-partido (no feed en vivo).
- **Formato:** tablas HTML (sin API ni CSV directo).
- **Autenticación:** ninguna.
- **Límites/ToS:** **no encontré términos de uso formales publicados**. Protegido con Cloudflare. Práctica comunitaria: citar «Data from NaturalStatTrick.com». El scraping es común en el ecosistema pero sin sanción explícita del propietario: zona gris.
- **Descarga masiva:** solo vía scraping de HTML (con Cloudflare delante) — poco robusto.
- **Calidad:** alta, comunidad confía en él.
- **Utilidad:** ★★★☆☆ — redundante con NHL API + MoneyPuck para nuestra plataforma; útil como verificación cruzada de xG. **No lo recomendaría como fuente primaria de ingesta.**

### 1.4 Hockey-Reference (Sports Reference)

- **URL:** [sports-reference.com/cfb → hockey-reference.com](https://www.hockey-reference.com/) (curl → HTTP 403 anti-bot; el sitio está activo y es de acceso manual libre)
- **Competiciones:** NHL desde **1917-18**; WHA, ligas históricas.
- **Datos:** resultados/boxscores históricos, logs de temporada por jugador desde la era moderna, porteros, alineaciones de juego, divisiones/conferencias históricas, playoffs.
- **En vivo:** no (post-partido).
- **Formato:** HTML tablas.
- **Autenticación:** ninguna (manual).
- **Límites:** política de bots de Sports-Reference ≈ **20 req/min**, 429 al exceder ([bot policy](https://www.sports-reference.com/bot-traffic.html)).
- **Condiciones comerciales:** ❌ [Terms of Use](https://www.sports-reference.com/termsofuse.html) + [Data Use](https://www.sports-reference.com/data_use.html): uso sin licencia está «expressly prohibited»; comercial requiere licencia paga.
- **Utilidad:** ★★★☆☆ para investigación/validación manual (profundidad histórica insuperable); ★☆☆☆☆ para ingesta comercial.

### 1.5 Elite Prospects

- **URL:** [developer.eliteprospects.com](https://developer.eliteprospects.com) (verificado HTTP 200 ✅)
- **Cobertura:** 900+ ligas del mundo (rosters, stats, premios, traspasos, jugadores).
- **Gratuidad:** ❌ **la API no tiene tier gratuito** — suscripción anual (reportada ~$96/año en comunidad; confirmar con ellos). El sitio web es navegable gratis manualmente.
- **Utilidad:** ★★★☆☆ si algún día se necesita cobertura multi-liga profesional (es el estándar); ★☆☆☆☆ como fuente «gratuita».

### 1.6 HockeyTech / LeagueStat (`lscluster.hockeytech.com`) — AHL, ECHL, CHL (OHL/QMJHL/WHL), USHL, PWHL, y más

- **URL de ejemplo verificada:** `https://lscluster.hockeytech.com/feed/index.php?feed=gc&key=...&client_code=pwhl...` → HTTP 200 ✅
- **Documentación comunitaria:** [sportsdataverse hockeyTech JS](https://js.sportsdataverse.org/docs/reference/hockeytech) (endpoints, `client_code`, `key`, feeds).
- **Datos:** calendarios, resultados, boxscores con PBP estructurado, stats por jugador/equipo, standings para las ligas que corren sobre HockeyTech (mayoría del hockey norteamericano fuera de la NHL).
- **Autenticación:** paramétrica (`client_code` + `key` públicas conocidas por liga, tal como las usan los sitios oficiales de las ligas).
- **Límites/ToS:** ⚠️ **no es una API pública documentada**; HockeyTech la vende comercialmente. Los endpoints funcionan porque los sitios de las ligas los consumen. Sin garantía de continuidad ni permiso explícito → uso con cautela, rate limiting propio, sin dependencia crítica.
- **Utilidad:** ★★★★☆ técnicamente (única vía gratuita real para AHL/ECHL/CHL/PWHL); ★★☆☆☆ legalmente (gris).

### 1.7 ESPN hidden API — NHL

- **URLs verificadas:** `https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard` → HTTP 200 ✅ · `/teams` → 200 ✅
- **Datos:** calendarios por fecha, scores en vivo, boxscores (summary), rosters, standings; PBP básico vía `summary?event=`.
- **Autenticación:** ninguna. **Formato:** JSON. **Límites:** no documentados.
- **Condiciones:** no documentadas; implícito uso no comercial (es el backend de ESPN.com). Cambios sin aviso.
- **Utilidad:** ★★★☆☆ como respaldo redundante de scores/calendario NHL; no aporta datos que la NHL API no dé.

### 1.8 IIHF

- **URL:** [stats.iihf.com](https://stats.iihf.com) (verificado HTTP 200 ✅)
- **Datos:** resultados y estadísticas de torneos mundiales (Mundiales, Juegos Olímpicos, juveniles); predominantemente **reportes PDF** por partido; sitio web con stats navegables.
- **Sin API pública.** Utilidad: ★★☆☆☆ (torneos específicos; extracción manual).

### 1.9 TheSportsDB

- **URL:** [thesportsdb.com](https://www.thesportsdb.com)
- **Verificación:** la key comunitaria `3` fue **deshabilitada permanentemente** (observado en la respuesta del propio API); la nueva key de prueba `123` responde (HTTP 200) pero los endpoints valiosos de eventos de liga (p. ej. `eventspastleague` para NHL) devolvieron `null` — la mayoría del contenido útil pasó a premium.
- **Utilidad:** ★☆☆☆☆ — acceso gratuito quedó en modo demostración; **no recomendada**.

### 1.10 API-Sports (Hockey API) — freemium

- **URL:** [api-sports.io](https://api-sports.io) (curl → 403 por Cloudflare; sitio activo)
- **Plan gratuito:** 100 req/día por API, reset a las 00:00 UTC, cubre NHL + 170 ligas, endpoints de fixtures/standings/players/stats.
- **Condiciones:** el plan free exige atribución («Powered by API-Sports») y su uso está pensado para desarrollo/pruebas; **uso comercial requiere plan pago**. Sin garantía de profundidad histórica completa en free.
- **Utilidad:** ★★☆☆☆ — cuota diaria muy pequeña para ingesta histórica; viable solo como checador de resultados en vivo de baja frecuencia.

---

## 2. Catálogo — Fútbol americano colegial (NCAA D-I FBS/FCS)

### 2.1 CollegeFootballData.com (CFBD) — ⭐ fuente núcleo recomendada

- **URLs:** [collegefootballdata.com](https://collegefootballdata.com) · API: `https://api.collegefootballdata.com` · key gratuita: [collegefootballdata.com/key](https://collegefootballdata.com/key) (HTTP 200 ✅) · Documentación v2: [api.collegefootballdata.com/docs](https://api.collegefootballdata.com/docs/) con sección «Data availability»
- **Verificación:** `GET /games` sin key → HTTP 401 (confirma que la API requiere key gratuita) ✅
- **Competiciones:** NCAA D-I — **FBS y FCS** (enum `division=fbs|fcs|ii` en /games; II y D-III con cobertura menor).
- **Cobertura histórica (según su About + comunidad):**
  - Scores/schedules: **desde 1869**
  - Play-by-play: **~2011 en adelante** (calidad notablemente peor antes de ~2014: tipos de jugada faltantes, stats de jugador incompletas). 2009 y anteriores: solo box scores/drives.
  - **FCS:** PBP más irregular que FBS; comenzó después y con lagunas en 2010s tempranos.
- **Datos disponibles (mapeados a requisitos):**
  - Calendarios/resultados históricos ✅ /games
  - Stats por equipo y jugador ✅ /games/teams, /games/players, /stats/season/...
  - Yardas (pase/carrera), TDs ✅ (box scores normalizados)
  - Intercepciones, turnovers, sacks ✅ (team stats + categorías defensivas)
  - Third/fourth down conversions ✅ (team game stats)
  - Red zone efficiency ⚠️ parcial (en team stats de algunos años/box scores)
  - Drives ✅ /drives (incluye plays count, yardaje, resultado, tiempo)
  - Play-by-play ✅ /plays (paginación 2.000 registros/request; asociaciones jugador-estadística por jugada)
  - **EPA ✅** (/metrics/epa; PPA por jugador/jugada) — incluido en tier gratuito
  - **Success Rate ⚠️** — no existe como endpoint propio; se calcula sobre /plays (jugadas exitosas por down/distancia; cfbfastR ya lo deriva con su suite EP/WP)
  - Win Probability ✅ /metrics/wp
  - Estadísticas de localía ✅ — derivable de /games (campos homeTeam/awayTeam por partido; agregable casa/visitante por temporada)
  - **Elo/ratings:** CFBD expone ratings de polls (AP/Coaches/CFP) históricos ✅; Elo específico no — usar WarrenNolan (§2.3)
  - Strength of schedule ✅ (calculable;cfbfastR lo expone)
  - Recruiting ✅ /recruiting/players (estrellas, rankings por año)
  - Betting lines históricas ✅ /lines (spreads/totals abiertos y de cierre)
  - Conferencias ✅ /conferences + membresía histórica de equipos por temporada (útil para cambios de conferencia)
  - Venues, coaches, talent (composite por equipo) ✅
- **En vivo:** ❌ en tier gratuito (solo histórico). Live PBP/scoreboard en **Tier 2 ($5/mes)**.
- **Frecuencia:** post-partido en free; en vivo en tiers pagos.
- **Formato:** JSON.
- **Autenticación:** key gratuita (header `Authorization: Bearer`).
- **Límites (verificado en [api-tiers](https://collegefootballdata.com/api-tiers)):**
  - **Free $0: 1.000 llamadas/mes** (incluye histórico, líneas de apuestas, EPA/PPA/WP)
  - Academic $0 (.edu/.ac.uk): 3.000/mes
  - Tier 1 $1: 5.000 · Tier 2 $5: 30.000 + live PBP · Tier 3 $10: 75.000 + GraphQL … Tier 6 $30: 500.000
  - Exceso → HTTP 429 hasta el día 1 del mes siguiente
  - Una key comparte cuota entre fútbol y básquet
- **Condiciones comerciales (verificadas directamente en [collegefootballdata.com/terms](https://collegefootballdata.com/terms)):** ✅✅ **El uso comercial está permitido en TODOS los tiers** — «your subscription tier determines your API usage quota, not whether you may use the API commercially». Atribución «apreciada pero no requerida» («Data provided by CollegeFootballData.com»). **Almacenamiento/retención privadas permitidas** (incluido corpus histórico tras terminar la suscripción). **Prohibido:** revender/republish los datos como dataset standalone o bulk download, operar mirror/proxy del feed, dar acceso directo a respuestas crudas a clientes. Derivados (modelos, predicciones, rankings propios) sí publicables. No presentar los datos como oficiales de NCAA.
- **Descarga masiva:** el PBP de una temporada FBS (~150 jugadas/partido × ~1.500 partidos ≈ 225k jugadas) requiere ~110-115 llamadas (2.000/request). Backfill de ~10 temporadas ≈ ~1.100+ llamadas → excede el mes gratuito de una key; solución: backfill en 2 meses con la key gratuita, o 1 mes con Tier 2/3, o empaquetar por semana/equipo para no paginar de más.
- **Calidad:** alta y creciente (backfills históricos recurrentes); comunidad grande (cfbfastR, cfbd Python).
- **Utilidad:** ★★★★★ — es el único pilar comercialmente seguro y gratuito del catálogo entero.

### 2.2 ESPN hidden API — College Football

- **URL verificada:** `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard` → HTTP 200 ✅
- **Referencia comunitaria:** [gist de akeaswaran (ESPN hidden API)](https://gist.github.com/akeaswaran/b48b02f1c94f873c6655e7129910fc3b)
- **Datos:** scoreboard **con `limit=200` devuelve todos los juegos D-I del día (FBS+FCS)**; `summary?event=` con boxscore de equipo; standings; rankings (polls, FPI); recruiting histórico; algunos datos por jugada en summary de juegos recientes.
- **Cobertura histórica:** scores/boxscores recientes profundos; rankings y FPI de varias temporadas; PBP estructurado solo en años recientes y con calidad desigual para FCS.
- **Autenticación:** ninguna. **Formato:** JSON. **Límites:** no documentados (usar throttling).
- **Condiciones:** ⚠️ no documentadas; implícito uso no comercial (backend de ESPN.com). Cambios sin aviso.
- **Utilidad:** ★★★★☆ como complemento volumétrico gratuito (scores de todo D-I por día en 1 llamada); ★★☆☆☆ legalmente para producto comercial.

### 2.3 WarrenNolan.com — ratings (Elo, RPI/NET-equivalentes)

- **URLs verificadas:** [warrennolan.com/fbs/2026/elo](https://www.warrennolan.com/fbs/2026/elo) → HTTP 200 ✅
- **Datos:** **Elo** por equipo (y Elo de conferencia), RPI, rankings de polls, scores/schedules completos, predicciones/simulaciones; cubre **FBS y FCS**; históricos por año (URLs por temporada).
- **Formato:** HTML (sin API oficial); scrapeable con cuidado.
- **ToS:** no encontré términos publicados → zona gris; usar con rate limit y atribución.
- **Utilidad:** ★★★★☆ — la única fuente gratuita estructurada de Elo colegial año por año.

### 2.4 stats.ncaa.org (oficial NCAA)

- **Sitio:** [stats.ncaa.org](https://stats.ncaa.org) / [ncaa.com/stats/football/fbs](https://www.ncaa.com/stats/football/fbs) (HTTP 200 ✅)
- **Datos:** estadísticas oficiales de campeonatos NCAA (equipo/jugador por categoría), schedules/results de todas las divisiones, históricos online ~2002+.
- **API:** ❌ **no existe API pública oficial**. Envoltura comunitaria: [armstjc/ncaa_stats_py](https://github.com/armstjc/ncaa_stats_py) (HTTP 200 ✅, PyPI `ncaa-stats-py`) que parsea HTML.
- **ToS del scraping:** no explícito/claro; zona gris. El valor único de NCAA.org es el **sello oficial** para FCS y divisiones menores que CFBD/ESPN cubren peor.
- **Utilidad:** ★★★☆☆ — completar huecos FCS/D-II/D-III; no como pipeline primario.

### 2.5 Sports Reference — College Football (sports-reference.com/cfb)

- **URL:** curl → 403 anti-bot; sitio activo y navegable manualmente.
- **Datos:** scores desde **1869** (Princeton–Rutgers), box scores, stats de jugadores, SRS (Simple Rating System) históricos, coaching records, apuestas/cierres históricos, drafts.
- **Límites:** ~20 req/min; 429. **Comercial:** ❌ requiere licencia ([data_use](https://www.sports-reference.com/data_use.html)).
- **Utilidad:** ★★★☆☆ investigación/validación manual; ★☆☆☆☆ ingesta.

### 2.6 James Howell historical scores (jhowell.net)

- **URL verificada:** [jhowell.net/cf/scores/byname.htm](https://www.jhowell.net/cf/scores/byname.htm) → HTTP 200 ✅
- **Datos:** resultados históricos partido a partido del fútbol americano «major college» (FBS-equivalente, incluye programas históricos desaparecidos) **desde 1869** por equipo (con lagunas por equipo, p. ej. Alabama 1902–…).
- **Gratuidad:** sí; sitio personal sin licencia explícita → contactar al autor (cfootball@jhowell.net) si se reutiliza masivamente.
- **Cobertura FCS:** no sistemática (solo años «major» de los programas).
- **Utilidad:** ★★★☆☆ para historia profunda pre-2002 (donde CFBD solo tiene scores, sin detalle).

### 2.7 mcubed.net

- **URL:** [mcubed.net](http://www.mcubed.net/cfb/) — registros head-to-head históricos entre programas.
- **Utilidad:** ★★☆☆☆ (dato curatorial; redundante con Howell/CFBD para predicción).

### 2.8 SP+ (Bill Connelly) y FPI (ESPN)

- **SP+:** rankings completos publicados por Connelly en [X/@ESPN_BillC](https://x.com/ESPN_BillC) gratis; artículos completos detrás de **ESPN+ (pago)**. Histórico consolidado 2007+ no disponible como dataset gratuito oficial (versiones históricas circulan vía mirrors comunitarios, sin licencia clara). **No recomendar como fuente comercial.**
- **FPI:** consultable gratis en [espn.com/college-football/fpi](https://www.espn.com/college-football/fpi) y vía ESPN hidden API.
- **Utilidad:** ★★☆☆☆ como señales de referencia (no como insumo estructurado gratuito).

---

## 3. Catálogo — Datasets históricos y repositorios open source

| Recurso | Tipo | Contenido | Licencia/Uso | Enlace |
|---|---|---|---|---|
| **Zmalski/NHL-API-Reference** | Documentación | Todos los endpoints NHL (2 APIs), WADL | MIT (la doc); datos NHL sujetos a ToS NHL | [github](https://github.com/Zmalski/NHL-API-Reference) ✅200 |
| **MoneyPuck shots/seasons CSVs** | Dataset | 2M+ tiros con xG 2007-08→2026; season summaries 2008+ | **No comercial** + atribución | [moneypuck.com/data.htm](https://moneypuck.com/data.htm) ✅200 |
| **fivethirtyeight/data** | Dataset repo | nfl-elo (NFL 1920+), historical-ncaa-forecasts (basket), soccer-spi; sitio cerrado en 2023-24, repo es archivo histórico | CC-BY 4.0 (datos 538) | [github](https://github.com/fivethirtyeight/data) ✅200 |
| **sportsdataverse/cfbfastR** | Paquete R | CFBD+ESPN tidy; loaders de PBP con EP/WP; datasets derivados `cfbfastR-cfb-data` (ESPN 2002→presente) | Open source (GPL family); datos ESPN/CFBD según sus términos | [github](https://github.com/sportsdataverse/cfbfastR) ✅200 |
| **cfbd (Python)** | Paquete Python | Wrapper oficial-comunitario del API CFBD | Open source | [github.com/CFBD/cfbd-python](https://github.com/CFBD) |
| **armstjc/ncaa_stats_py** | Paquete Python | Parser de stats.ncaa.org (todas las divisiones) | Open source | [github](https://github.com/armstjc/ncaa_stats_py) ✅200 |
| **HarryShomer/Hockey-Scraper** | Paquete Python | PBP + shifts NHL (API oficial + HTML fallback) | Open source (MIT) | [github.com/HarryShomer/Hockey-Scraper](https://github.com/HarryShomer/Hockey-Scraper) |
| **danmorse314/hockeyR** | Paquete R | PBP NHL limpio con columnas xG; rosters/shifts | Open source | [github.com/danmorse314/hockeyR](https://github.com/danmorse314/hockeyR) |
| **sportsdataverse/fastRhockey** | Paquete R | NHL + PWHL (HockeyTech); PBP/schedules | Open source | [github.com/sportsdataverse/fastRhockey](https://github.com/sportsdataverse/fastRhockey) |
| **sportsdataverse js (hockeyTech)** | Doc/lib JS | Endpoints HockeyTech para ligas menores/PWHL | Open source (la doc); feeds según ligas | [js.sportsdataverse.org/docs/reference/hockeytech](https://js.sportsdataverse.org/docs/reference/hockeytech) |
| **pwhl-scraper** | Paquete Python | PBP/stats PWHL vía HockeyTech | Open source | [github.com/topics/pwhl](https://github.com/topics/pwhl) |
| **Kaggle: NHL Game Data** | Dataset | Partidos/stats NHL ~2014–2023 (derivados de NHL API/Hockey-Reference) | Verificar licencia por dataset | [kaggle.com](https://www.kaggle.com/datasets) |
| **Kaggle: College Football box scores** | Dataset | Box scores CFB 2002–2025 | Verificar licencia por dataset | [kaggle.com](https://www.kaggle.com/datasets) |
| **jhowell.net scores** | Dataset web | Resultados major college desde 1869 | Sin licencia explícita; contactar autor | [jhowell.net/cf/scores/byname.htm](https://www.jhowell.net/cf/scores/byname.htm) ✅200 |

> **Nota sobre datasets de Kaggle/terceros derivados de Hockey-Reference o Sports-Reference:** heredan las restricciones de Sports-Reference (no comercial). No usarlos como insumo de producto sin verificar origen (CFBD/ESPN/NHL API sí son orígenes correctos).

---

## 4. Tabla comparativa de cobertura

### Hockey

| Fuente | Calendarios/Resultados | PBP | xG | Porteros (sv%) | Faceoffs/PP/PK | TOI/shifts | Alineaciones | Lesiones | En vivo | Histórico | Uso comercial | Fiabilidad |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| NHL API | ✅ | ✅ (coords) | ❌ (calcular) | ✅ | ✅ | ✅ (shiftcharts) | ✅ rosters | ❌ | ✅ | ~2009+ PBP; más atrás agregado | ⚠️ gris | Alta |
| MoneyPuck | ⚠️ parcial | ⚠️ shots only | ✅ por tiro | ✅ derivado | ✅ derivado | ✅ TOI por tiro | ❌ | ❌ | ❌ (nocturna) | 2007+ | ❌ no-comercial | Alta |
| NST | ✅ | ⚠️ tablas | ✅ equipo/jugador | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | 2007+ | ⚠️ sin ToS | Media-alta |
| Hockey-Reference | ✅ | ⚠️ boxscores | ❌ | ✅ | ✅ | ⚠️ | ⚠️ | ❌ | ❌ | **1917+** | ❌ licencia | Alta |
| Elite Prospects | ✅ (900 ligas) | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ rosters | ⚠️ | ❌ | Décadas | ❌ de pago | Alta |
| HockeyTech (AHL/CHL/PWHL…) | ✅ | ✅ | ❌ | ✅ | ✅ | ⚠️ | ✅ | ❌ | ⚠️ | Variable | ⚠️ gris | Media |
| ESPN NHL | ✅ | ⚠️ básico | ❌ | ⚠️ | ⚠️ | ❌ | ⚠️ | ❌ | ✅ | Reciente | ⚠️ | Media-alta |
| API-Sports hockey | ✅ | ⚠️ | ❌ | ⚠️ | ⚠️ | ❌ | ⚠️ | ❌ | ✅ | Variable | ❌ free no-comercial | Media |

### Fútbol americano colegial

| Fuente | Scores/Schedules | Box scores equipo/jugador | PBP | EPA | Drives | 3rd/4th down | Red zone | TOP | SoS | Ratings/Elo | Betting lines | Recruiting | FCS | En vivo (free) | Uso comercial | Fiabilidad |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **CFBD** | ✅ **1869+** | ✅ | ✅ ~2011+ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ derivable de drives | ✅ calculable | ✅ polls | ✅ históricas | ✅ | ✅ (PBP irregular) | ❌ | **✅ sí** | Alta |
| ESPN CFB | ✅ (limit=200, todo D-I) | ✅ | ⚠️ reciente | ❌ | ❌ | ⚠️ | ⚠️ | ⚠️ | ❌ | ✅ polls/FPI | ❌ | ✅ histórico | ✅ | ✅ | ⚠️ | Media-alta |
| WarrenNolan | ✅ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ implícito | ✅ **Elo** | ❌ | ❌ | ✅ | ⚠️ | ⚠️ sin ToS | Media-alta |
| stats.ncaa.org | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ (team stats) | ⚠️ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ✅ (todas divisiones) | ⚠️ | ⚠️ | Media |
| Sports-Ref CFB | ✅ 1869+ | ✅ | ❌ | ❌ | ❌ | ✅ | ⚠️ | ⚠️ | ✅ (SRS) | ❌ | ✅ históricas | ⚠️ | ⚠️ | ❌ | ❌ licencia | Alta |
| jhowell.net | ✅ 1869+ (FBS-eq) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ sin licencia | Alta |
| cfbrfastR/cfbd-py | (envolturas) | — | — | — | — | — | — | — | — | — | — | — | — | — | según fuente | Alta |

---

## 5. Evaluación de cobertura y combinaciones

### Qué se obtiene gratis y qué no

**Hockey — disponible gratis:**
- Todo el pipeline oficial NHL: calendario → boxscore → PBP con coordenadas → shifts → EDGE (tracking). Histórico PBP ~2009+.
- xG histórico con coordenadas y contexto pre-tiro (MoneyPuck CSVs) para **investigación/entrenamiento interno no comercial**.

**Hockey — NO disponible gratis (gaps reales):**
1. **xG listo para uso comercial** → hay que **construir modelo propio** (datos: NHL API PBP; metodología de referencia: modelo MoneyPuck documentado públicamente; no copiar sus salidas a producto).
2. **Lesiones y alineaciones confirmadas pre-juego** → no hay API gratuita estructurada (sitios como Daily Faceoff son manuales/scrape-prohibido). Gap estructural de la industria.
3. **Cobertura AHL/ECHL/CHL/PWHL con garantías** → solo vía HockeyTech informal (sin ToS) o proveedores de pago (Sportradar/Elite Prospects).
4. **Odds históricas y en vivo** hockey/CFB → The Odds API free = 500 créditos/mes y los endpoints históricos cuestan **10× crédito por llamada** (≈ solo ~15-16 llamadas/día simples); histórico real requiere ~$30/mes. (Fuente: [the-odds-api.com](https://the-odds-api.com) ✅200; análisis de costos: [oddspapi.io](https://oddspapi.io/blog/the-odds-api-free-tier-limits)). Conclusión: **las odds no son un gap cubierto gratis**; CFBD /lines cubre líneas CFB históricas de apertura/cierre de forma gratuita.
5. **Ligas europeas (KHL, SHL, Liiga, DEL)** → sin API gratuita estable verificada; fuera de alcance para el pre-MVP.

**CFB — disponible gratis:**
- Pipeline completo FBS: scores 1869+, box scores, PBP ~2011+, EPA/PPA, WP, drives, líneas históricas, recruiting, polls — todo con permiso comercial explícito (cuota 1.000/mes).
- FCS: scores y stats completos; PBP irregular.
- Elo (WarrenNolan), SRS/consultas históricas (manual), historia pre-2002 (Howell).

**CFB — NO disponible gratis (gaps reales):**
1. **PBP en vivo** (CFBD Tier 2 $5/mes) — el tier gratuito es solo histórico.
2. **Cuota gratuita insuficiente para backfill grande + operación simultánea** → plan: backfill del histórico en 1-2 ciclos mensuales con la key gratuita, luego operación diaria ligera (scores del día ≈ 2-6 llamadas vía ESPN gratis, stats post-partido ≈ 30-80 llamadas/mes vía CFBD). Cuota académica (3.000) si hay email .edu.
3. **Reportes de lesiones/disponibilidad de jugadores (CFB)** → no hay fuente gratuita estructurada (CFBD la retiró hace años). Gap estructural.
4. **SP+ histórico consolidado** → ESPN+ (pago). Sustitutos gratuitos: calcular SoS/SRS propio sobre CFBD.
5. **TOP (time of possession) agregado por temporada** → derivable de drives (CFBD) en FBS; incompleto en FCS.

### Combinaciones que maximizan cobertura (sin redundancia)

1. **CFB comercial:** `CFBD (backbone autorizado)` + `ESPN CFB API (scores diarios de todo D-I sin gastar cuota)` + `WarrenNolan (Elo para features)` + `Howell (historia pre-2002, si el autor lo autoriza)`. → Redundancias a evitar: Sports-Reference CFB (misma información que CFBD/Howell pero sin licencia comercial) y mcubed.net (curatorial).
2. **NHL:** `NHL API (backbone técnico)` + `MoneyPuck (solo I&D interno / validación de nuestro modelo de xG)` + `shiftcharts endpoint para TOI/líneas`. → Redundancias a evitar: NST, Hockey-Reference y ESPN NHL como ingesta (aportan poco o nada que la NHL API + cálculo propio no dé; y NST/Hockey-Reference añaden restricciones o Cloudflare).
3. **Expansión hockey no-NHL:** HockeyTech por liga (AHL/ECHL/CHL/USHL/PWHL) con `client_code/key` conocidos, asumiendo riesgo de continuidad; fastRhockey/pwhl-scraper como implementaciones de referencia.
4. **Orquestación:** los paquetes SportsDataverse (cfbfastR, fastRhockey, hockeyR) no son fuentes nuevas — son envoltorios convenientes sobre CFBD/ESPN/NHL/HockeyTech; elegir uno por deporte como referencia de mapeo de campos, no como capa de ingesta obligatoria.

---

## 6. Disponibilidad por liga y temporada

| Liga/Competición | Fuente gratuita | Temporadas con datos gratuitos |
|---|---|---|
| NHL | NHL API | PBP detallado ~2009-10→hoy; boxscores/schedule atrás adicionales; registros históricos profundos vía Hockey-Reference (no comercial) |
| NHL — tiros con xG | MoneyPuck | **2007-08 → 2025-26** (+2026-27 nocturna) |
| AHL / ECHL / CHL / USHL / PWHL | HockeyTech informal | Variable por liga (típicamente ~2015+, con lagunas) |
| IIHF (torneos) | stats.iihf.com | Histórico de torneos; PDFs |
| NCAA FBS | CFBD | Scores **1869+**; box scores modernos; **PBP ~2011+**; EPA/WP 2011+; líneas históricas; recruiting 2000+ |
| NCAA FCS | CFBD | Scores completos; PBP irregular (mejor 2014+); stats de temporada |
| NCAA D-II/D-III | stats.ncaa.org (manual) | ~2002+ online |
| Polls/rankings CFB | CFBD + ESPN + WarrenNolan | CFBD polls históricos; ESPN FPI varias temporadas; WarrenNolan Elo por año |
| NFL-Elo (referencia metodológica) | fivethirtyeight/data | 1920+ (archivo estático, no CFB) |

---

## 7. Restricciones y licencias — resumen legal

| Nivel | Fuentes | Implicación para producto comercial |
|---|---|---|
| ✅ **Comercial permitido explícito** | **CFBD** (todos los tiers; atribución no obligatoria; almacenamiento privado permitido; prohibido revender bulk/mirror) | Única fuente grande segura del catálogo. Respetar: no revender dataset crudo, no exponer feed crudo. |
| ⚠️ **Gris** | NHL API (ToS prohíbe automatización no autorizada; feeds comerciales vía Sportradar/SMT), ESPN hidden API (no documentada), HockeyTech (no pública), WarrenNolan (sin ToS), stats.ncaa.org (sin ToS claro), jhowell.net (sin licencia) | Uso común en la industria pero **con riesgo legal documentable**. Mitigaciones: rate limiting, caching, atribución, monitoreo de cambios de ToS, plan B de proveedor pago. |
| ❌ **No comercial / requiere licencia** | MoneyPuck (no-comercial + atribución; scraping con aprobación), Sports-Reference family (licencia para comercial), Elite Prospects (pago), API-Sports free (desarrollo + atribución), ESPN+ (SP+), datasets Kaggle derivados de Sports-Reference | Excluir de producto; admitidos para I&D interno y validación. |

**Regla práctica adoptada para este inventario:** ninguna recomendación asume scraping que viole condiciones de uso publicadas; las fuentes «gris» se marcan como tales y con riesgo explícito.

---

## 8. Fuentes recomendadas por deporte (prioridad de adopción)

### Fútbol americano colegial (orden de adopción)
1. **CFBD** — backbone con licencia comercial explícita y gratuita (key gratuita; 1.000/mes). Cubre ~90% de la lista de requisitos del objetivo.
2. **ESPN CFB hidden API** — scores del día de todo D-I en 1 llamada (ahorra cuota CFBD); boxscores de respaldo.
3. **WarrenNolan** — Elo por temporada para features de ratings.
4. **jhowell.net** — solo si se requiere historia pre-2002 masiva (pedir permiso al autor).
5. **stats.ncaa.org** — solo para huecos FCS/D-II puntuales (manual, no pipeline).

### Hockey (orden de adopción)
1. **NHL API (`api-web.nhle.com` + `stats/rest`)** — backbone técnico completo (calendario, boxscore, PBP con coordenadas, shifts, EDGE). Documentar el riesgo ToS y el plan de mitigación (caching, baja frecuencia, proveedor pago como plan B).
2. **MoneyPuck CSVs** — para calibrar nuestro propio modelo de xG en fase de I&D; **no** como insumo de producto.
3. **HockeyTech feeds** — si se expande a AHL/ECHL/CHL/PWHL, con rate limiting propio y tolerancia a roturas.
4. **Modelo xG propio** — construido sobre PBP NHL (gap estructural: xG comercial no existe gratis).

---

## 9. Datos faltantes y limitaciones (consolidado)

**No existe gratis en ningún deporte (gap estructural):**
- Lesiones y disponibilidad estructuradas (NHL y CFB).
- Alineaciones confirmadas pre-juego (NHL).
- Odds históricas masivas (The Odds API free insuficiente: 500 créditos/mes, histórico a 10× crédito).
- xG NHL «listo para producto» (MoneyPuck no-comercial → construir propio).
- SP+ histórico completo (ESPN+).

**Gratis con restricciones de volumen:**
- CFBD live PBP (pago $5/mes) y cuota gratuita 1.000/mes (suficiente para operación diaria post-backfill, no para backfill total en un mes).
- Elite Prospects multi-liga (pago ~$96/año aprox., confirmar).
- The Odds API histórico (~$30/mes si se desea realmente).

**Gratis con riesgo legal (aceptado de facto por la industria, documentar):**
- NHL API (ToS), ESPN APIs (no documentadas), HockeyTech (no pública), WarrenNolan/stats.ncaa.org (sin ToS claro).

**Riesgos de continuidad:**
- APIs no documentadas pueden cambiar sin aviso (la NHL ya rompió su API en 2023). Cualquier arquitectura debe aislarse detrás de un adaptador por fuente.

---

## 10. Apéndice — Enlaces verificados (2026-11-08, método curl/navegador)

| Enlace | Código HTTP | Estado |
|---|---|---|
| https://api-web.nhle.com/v1/schedule/2026-11-08 | 200 | ✅ vivo, sin key |
| https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard | 200 | ✅ vivo |
| https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard | 200 | ✅ vivo |
| https://moneypuck.com/data.htm | 200 | ✅ vivo |
| https://www.naturalstattrick.com/games.php | 200 (navegador; curl → Cloudflare) | ✅ vivo |
| https://collegefootballdata.com/key | 200 | ✅ vivo |
| https://api.collegefootballdata.com/games (sin key) | 401 | ✅ vivo (exige key free) |
| https://collegefootballdata.com/api-tiers · /terms · /about | 200/lectura | ✅ términos leídos |
| https://www.warrennolan.com/fbs/2026/elo | 200 | ✅ vivo |
| https://www.jhowell.net/cf/scores/byname.htm | 200 | ✅ vivo |
| https://stats.iihf.com | 200 | ✅ vivo |
| https://www.ncaa.com/stats/football/fbs | 200 | ✅ vivo |
| https://lscluster.hockeytech.com/feed/index.php?feed=gc&key=…&client_code=pwhl… | 200 | ✅ feed vivo |
| https://github.com/Zmalski/NHL-API-Reference | 200 | ✅ |
| https://github.com/sportsdataverse/cfbfastR | 200 | ✅ |
| https://github.com/armstjc/ncaa_stats_py | 200 | ✅ |
| https://github.com/fivethirtyeight/data | 200 | ✅ |
| https://developer.eliteprospects.com | 200 | ✅ (API solo de pago) |
| https://the-odds-api.com | 200 | ✅ (free limitado) |
| https://www.thesportsdb.com (key 123) | 200 | ⚠️ key comunitaria antigua deshabilitada; free ahora casi inútil |
| https://www.sports-reference.com/cfb/ y /data_use.html | 403 (anti-bot) | ✅ sitio activo, acceso manual libre |
| https://api-sports.io | 403 (anti-bot) | ✅ sitio activo; free 100/día, no-comercial |

**Referencias comunitarias consultadas:** [Gist ESPN hidden API](https://gist.github.com/akeaswaran/b48b02f1c94f873c6655e7129910fc3b) · [sportsdataverse hockeyTech docs](https://js.sportsdataverse.org/docs/reference/hockeytech) · [NHL ToS](https://www.nhl.com/info/terms-of-service) · [Sports-Reference ToS](https://www.sports-reference.com/termsofuse.html) y [Data Use](https://www.sports-reference.com/data_use.html) · [blog límites The Odds API](https://oddspapi.io/blog/the-odds-api-free-tier-limits) · [r/CFBAnalysis (cobertura PBP CFBD)](https://www.reddit.com/r/CFBAnalysis/) · [hockeyR](https://github.com/danmorse314/hockeyR) · [fastRhockey](https://github.com/sportsdataverse/fastRhockey) · [Hockey-Scraper](https://github.com/HarryShomer/Hockey-Scraper) · [topics/pwhl](https://github.com/topics/pwhl)
