# 05 — Evidencia Runtime Autenticada y Payloads Reales Multi-Deporte (Astra AI)

**Fecha de captura en vivo:** `2026-11-14` (sábado, horario `America/Mexico_City`)  
**Objetivo:** Verificación empírica en runtime autenticado (`has_access: true`, prueba gratuita activa de 7 días) de todos los flujos multi-deporte, funciones Edge, RPCs, tablas PostgREST, estados de interfaz y estructuras JSON reales servidas por **Astra AI (`https://astraanalisis.com/`)**.

---

## 1. Índice de Evidencias REA (`evidence_id`) y Protocolo de Seguridad

Todas las observaciones dinámicas se ejecutaron **exclusivamente mediante REA CLI (`rea.mjs capture-browser-scenario`)** sobre Google Chrome headless (`1440×960` y `1440×1200`, `es-MX`, `America/Mexico_City`, `color_scheme: "dark"`, `service_workers: "block"`), inyectando la credencial únicamente por variable de entorno (`ASTRA_PASSWORD`) declarada en `secrets` y aplicando redacción en memoria de `access_token` (`[REDACTED_JWT]`) y `refresh_token` (`[REDACTED_REFRESH]`) antes de persistir cualquier archivo en disco.

| Escenario | `evidence_id` de REA | Resumen limpio en `raw/` | Pasos | Duración | Alcance verificado en vivo |
| --- | --- | --- | ---: | ---: | --- |
| **02 — Tour Autenticado Base** | `ev_42e6c7319eb27372b49758df47887b2764d276a39d760c6d6f0874b7f5d03bc6` | `raw/02-authenticated-tour.json` *(sanitizado)* | 11 | ~34.0 s | Login inicial, `my_access` (`has_access: true`), cartelera general de Fútbol, NHL, NBA, NFL y MLB en `2026-11-14`. |
| **03 — Fútbol Profundo (`upcoming` + `FT` + `astra_picks`)** | `ev_fc43c6696ef7a62da591fe98b66a05d96f17be9fcbb4d51ab6e6d9c4c60b57d3` | `raw/03-futbol-summary.json` | 24 | 56.4 s | Liga MX `1550951` (`NS`), UEFA Nations League `1528974` (`NS` + fallback `league-standings`), LaLiga2 `1570024` (`FT` con xG y 17 métricas), Europa League `/partido/1636276` (`FT` con `astra_picks` real y gráfico de momento). |
| **04 — Deportes US (`NBA`, `NHL`, `NFL` fechas, `MLB` offseason)** | `ev_ae93e5b0dd674307ba47ef7bc3b4deb222bbd235d3dabb26bcfec8634219f46c` | `raw/04-us-sports-summary.json` | 32 | 147.2 s | NBA `401909980` (`upcoming`) y `401909296` (`final` + Edge Function `nba-players`), NHL `2026020312` (`upcoming`) y `2026020310` (`final`), NFL tira de fechas `2026-11-15` (12 juegos `forecast_ready: true`) y `2026-11-16` (MNF `forecast_ready: false`), MLB `/mlb` en temporada baja (`0 partidos`). `dropped: 0`. |
| **05 — NFL Detalle, Perfiles Multi-Deporte, Historial e Institucional** | `ev_b2082a83f40b298b1f62d60e156ccb00dfa1bb20161c30653505db326b4395e3` | `raw/05-equipos-institucional-summary.json` | 50 | 126.7 s | Expansión visual de jugador NBA (`Pascal Siakam`), detalle completo NFL `401873063` (49ers @ Cowboys + `record_ai_view`), validación `/equipo/football/2282` vs `/equipo/futbol/2282`, `/equipo/nba/18`, `/equipo/nhl/16`, `/equipo/nfl/12`, `/equipo/mlb/19` (404 ESPN ID), `/historial/nba/18/401909296` (`stored: true`), `/cuenta`, `/siguiendo`, `/nosotros`, `/privacidad` y `/terminos`. |
| **06 — Historial Externo (`stored: false`) y MLB StatsAPI (`119`)** | `ev_b24b4829a5c7f11fb2e112bbe5fbe70dc4ff30a2a7546d50e6b0f7af41b1a064` | `raw/06-mlb-y-historial-summary.json` | 10 | 24.0 s | Ficha histórica no almacenada en Supabase (`/historial/nfl/12/401873006` Chiefs 22–6 Chargers con `stored: false` + 18 métricas ESPN en vivo) y perfil MLB válido (`/equipo/mlb/119` Los Angeles Dodgers vía MLB StatsAPI). |

### Garantías de Seguridad Verificadas
- **Cero secretos en disco:** Ni la contraseña ni ningún `access_token` (`eyJ...`) o `refresh_token` real aparecen en `Reportes/analisis-astra/`.
- **Navegación estrictamente de lectura:** No se invocaron flujos de pago (`create-checkout`, `create-mp-preference`), cierre de sesión ni borrado de cuenta (`delete-account`). Tampoco apareció ningún CAPTCHA.
- **Control de tamaño en `raw/`:** No se dejaron volcados crudos gigantes con tokens; cada escenario conserva su archivo de entrada (`*-input.json`) y su resumen estructurado libre de credenciales (`*-summary.json`, entre `22 KB` y `106 KB`), mientras que los cuerpos limpios residen en `evidence/live-payloads/`.

---

## 2. Matriz Empírica de Proveedores Upstream e Identificadores por Deporte

El tráfico real capturado demuestra que Astra AI opera una arquitectura **híbrida de 4 proveedores externos**, donde el espacio de IDs de equipos y partidos cambia según el deporte:

| Deporte (`slug` en rutas) | Proveedor Upstream Principal | Ejemplo de IDs Reales Capturados | CDN de Logos / Fotos | Fuente `match_live` (`momentum_method`) | Fuente `match-odds` | Fuente `team-profile` |
| --- | --- | --- | --- | --- | --- | --- |
| **Fútbol (`futbol`)** | **API-Sports** (`v3.football.api-sports.io`) | Partido: `1550951`, `1570024`, `1636276`<br>Equipo: `2282` (Monterrey), `2290` (Querétaro)<br>Liga: `262` (Liga MX) | `media.api-sports.io/football/...` | `"API-Sports"` (`"sampled"`: presión cada 2 min por tiros + córners) | API-Sports (`bookmaker.id: 2`, `"Marathonbet"`, momios decimales 1X2) | `"API-Sports · historial de Astra"` (10 métricas + xG en últimos 20 partidos) |
| **NBA (`nba`)** | **ESPN API** (`site.api.espn.com`) | Juego: `401909980`, `401909296`<br>Equipo: `18` (NY Knicks), `11` (Pacers)<br>Jugador: `3149673` (Pascal Siakam) | `a.espncdn.com/i/teamlogos/nba/...` y `headshots/nba/players/...` | `"ESPN"` (`"points"`: puntos anotados por minuto) | ESPN Provider `"100"` (`"DraftKings"`, moneyline convertido a decimal sin empate) | `"NBA"` vía ESPN (promedios `scored`/`conceded` en 20 juegos) |
| **NHL (`nhl`)** | **NHL Web API** (`api-web.nhle.com`) + **ESPN** (momios/tablas) | Juego: `2026020312`, `2026020310`<br>Equipo: `16` (Blackhawks), `52` (Jets) | `assets.nhle.com/logos/nhl/svg/..._dark.svg` | `"NHL"` (`"shots"`: tiros por minuto + goles/penalizaciones) | ESPN Provider `"100"` (`"DraftKings"`, decimal 2 vías) | `"NHL"` vía `nhle.com` (`scored`/`conceded` en 20 juegos) |
| **NFL (`nfl`)** | **ESPN API** (`site.api.espn.com`) | Juego: `401873063` (SF@DAL), `401873058` (KC@ATL)<br>Equipo: `12` (Chiefs), `6` (Cowboys) | `a.espncdn.com/i/teamlogos/nfl/500-dark/...` | `"ESPN"` (`"points"` en partidos/historial) | ESPN Provider `"100"` (`"DraftKings"`, decimal 2 vías) | `"NFL"` vía ESPN (`scored`/`conceded` en 20 juegos) |
| **MLB (`mlb`)** | **MLB StatsAPI** (`statsapi.mlb.com`) | Juego hist.: `849810` (NLCS)<br>Equipo: `119` (LA Dodgers), `158` (Brewers)<br>*(Nota: ID ESPN `19` devuelve `404`)* | `www.mlbstatic.com/team-logos/...svg` | `"MLB"` (inactivo en cartelera por temporada baja en nov 2026) | Sin juegos activos en nov 2026 | `"MLB"` vía MLB StatsAPI (`scored`/`conceded` en 20 juegos) |

> [!IMPORTANT]
> **Inconsistencia de slug inglés vs español verificada en vivo:** Las rutas dinámicas `/equipo/[sport]/[id]` y `/historial/[sport]/[teamId]/[matchId]` validan estrictamente `sport ∈ {'futbol', 'nhl', 'mlb', 'nba', 'nfl'}` (`mod_0866`). Al navegar a `/equipo/football/2282` (paso 22 del Escenario 05), la aplicación no dispara ninguna petición a `team-profile` y renderiza inmediatamente `"Equipo no encontrado."`, mientras que `/equipo/futbol/2282` carga el perfil completo de Monterrey.

---

## 3. Matriz de Disparo Runtime de Endpoints (PostgREST, RPCs y Edge Functions)

Durante los escenarios autenticados se confirmó cuándo y bajo qué condición exacta se ejecuta cada llamada de red:

| Operación / Función Cliente | Método y Ruta (`*.supabase.co`) | Condición Exacta de Disparo en Vivo | Observaciones Clave de Runtime |
| --- | --- | --- | --- |
| **Estado de acceso (`my_access`)** | `POST /rest/v1/rpc/my_access` | En arranque de sesión, cambio de estado Auth y cada navegación completa (`goto`). | Devuelve `has_access`, `trial_ends_at`, `paid_until`, `price_mxn: 199`, `leagues: 48`, `iap_product_id: "astra_30_dias"`. |
| **Perfil de usuario (`profiles`)** | `GET /rest/v1/profiles?select=id,display_name,created_at,avatar_path&id=eq.<uid>` | Inmediatamente después de tener sesión activa. | Devuelve `display_name: "Juan Pablo"`, `avatar_path: null`. |
| **Cartelera diaria Fútbol + Tendencias** | `GET /rest/v1/fixtures?...` + 4× `GET /rest/v1/games?sport=eq.{nhl,nba,nfl,mlb}` | Al cargar `/` o cualquier hub deportivo (`/nba`, `/nhl`, `/nfl`, `/mlb`). | La barra superior de **Tendencias** consulta en paralelo los 5 deportes del día actual aunque el usuario esté viendo solo uno. |
| **Detalle Fútbol (`fetchFixture`)** | `GET /rest/v1/fixtures?select=...,predictions(...),analyses(...)&id=eq.<id>` | Al abrir `/partido/[id]` o seleccionar fila en `/` (`/?partido=[id]`). | En `predictions` sí viaja el objeto completo `prediction.context` (ratings Dixon–Coles, dispersiones NB y top 3 marcadores exactos). |
| **Detalle US Sports (`fetchSportGame`)** | `GET /rest/v1/games?select=...,game_predictions(sport,game_id,prediction,generated_at),game_analyses(...)` | Al abrir `/juego/[sport]/[id]` o seleccionar fila (`/[sport]?juego=[id]`). | **Omite la columna `context`** en el `select` de `game_predictions`: solo descarga `prediction` (`win` + `rows` formateados) y `analysis.sections`. |
| **Pick destacado (`fetchAstraPick`)** | `GET /rest/v1/astra_picks?select=pick&sport=eq.<sport>&match_id=eq.<id>` | En paralelo al abrir cualquier partido/juego. | Vacío (`[]`) en la mayoría de partidos; poblado en partidos curados por el canal (p. ej. `1636276` Juventus vs Rennes: `[{"pick": "Más de 8.5 tiros de esquinas"}]`). |
| **Telemetría en vivo (`fetchLiveMatch`)** | `GET /rest/v1/match_live?select=...&sport=eq.<sport>&match_id=eq.<id>` | Al abrir cualquier partido/juego (y polling cada ~30–60 s si está en curso). | Devuelve `[]` en partidos `NS`/`upcoming`; en partidos en curso o `FT`/`final` entrega `info`, `statistics`, `events` y `momentum`. |
| **Momios (`fetchMatchOdds`)** | `POST /functions/v1/match-odds` (`{sport, match_id}`) | Solo en pestaña `"Detalles"` cuando el partido **no ha finalizado** (`status !== 'FT'` / `!== 'final'`). | **No se dispara en partidos finalizados** (`1570024`, `401909296`, `2026020310`). En próximos devuelve momios decimales de Marathonbet (Fútbol) o DraftKings (NBA/NHL/NFL). |
| **Tabla Fútbol (`fetchFootballStandings`)** | 1) `GET /rest/v1/standings?league_id=eq.<L>&season=eq.<S>`<br>2) Fallback: `POST /functions/v1/league-standings` | En pestaña `"Detalles"` de Fútbol. Si PostgREST `standings` devuelve filas (Liga MX `262`), usa esas filas; **solo si devuelve `[]`** (UEFA Nations League `5`), invoca la Edge Function `league-standings`. | Ahorra invocaciones Edge en ligas domésticas indexadas y resuelve torneos multi-grupo vía API-Sports bajo demanda. |
| **Tabla US Sports (`league-standings`)** | `POST /functions/v1/league-standings` (`{sport}`) | En pestaña `"Detalles"` de NBA, NHL y NFL. | Devuelve `groups[]` con conferencias/divisiones (`record`, `percentage`, `points`, `difference`). |
| **Boxscore NBA (`nba-players`)** | `POST /functions/v1/nba-players` (`{match_id}`) | **Lazy**: únicamente al pulsar la pestaña `"Estadísticas"` de un juego NBA iniciado o finalizado. | Devuelve titulares, banca y bajas (`did_not_play`, `reason`) de ambos equipos con 14 estadísticas individuales por jugador. |
| **Auditoría de lectura IA (`record_ai_view`)** | `POST /rest/v1/rpc/record_ai_view` (`{p_sport, p_match_id}`) | **Lazy**: únicamente al pulsar la pestaña `"Análisis con IA"` con `has_access: true`. | Responde `HTTP 204 No Content`. Sirve para telemetría de consumo y control anti-abuso/reembolsos por cuenta. |
| **Ficha de equipo (`team-profile`)** | `POST /functions/v1/team-profile` (`{sport, team_id, page}` o `{sport, team_id, match_id}`) | Al abrir `/equipo/[sport]/[id]` (`page: 0`) o `/historial/[sport]/[teamId]/[matchId]` (`match_id`). | Dual: con `page` devuelve `team`, `info`, `summary` (20 partidos) e `history[]` con bandera `stored: boolean`; con `match_id` devuelve `{"stored": true}` o `{stored: false, match, live}`. |
| **Contexto interno del modelo (`fetchTeamModel`)** | `GET /rest/v1/games?...` → `GET /rest/v1/game_predictions?select=game_id,context,generated_at` | Al abrir `/equipo/[sport]/[id]` con sesión activa. | **Hallazgo crítico de arquitectura:** es la **única ruta del frontend** que descarga `game_predictions.context` en NBA, NHL y NFL, exponiendo los pesos exactos del ensamble (`model_components`) y el prompt JSON (`digest`) enviado al LLM. |

---

## 4. Flujos Probados en Vivo y Comportamiento Exacto de la Interfaz

### 4.1 Fútbol (`/` y `/partido/[id]`)

- **Redirección adaptativa en escritorio (`>= 960 px`):** Navegar directamente a `/partido/1636276` redirige por cliente (`router.replace`) a `/?partido=1636276`, manteniendo el layout de **3 columnas** (barra lateral izquierda de `Mis competiciones`, lista central filtrable con `78 partidos` en `2026-11-14` e insignia `+ IA` en partidos con pronóstico, y panel derecho de detalle).
  - Captura: [01-home-futbol.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/screenshots/01-home-futbol.png)
- **Partido próximo con IA (`1550951` — Club Querétaro vs Monterrey, Liga MX Apertura J7):**
  - **Pestaña `Detalles`:** Muestra `Cuotas del partido · Resultado final · 90 minutos` (`3.44 / 3.44 / 1.99` de Marathonbet) y `Tabla de posiciones · Liga MX: Apertura` resaltando a Monterrey (`10.º`, `21 pts`) y Querétaro (`12.º`, `20 pts`).
  - **Pestaña `Análisis con IA`:** Dispara `record_ai_view` y despliega `Pronóstico de Astra AI` (`Goles esperados: Club Queretaro 1.41 | Monterrey 1.55`, `Ambos equipos anotan: 60%`, `Tiros de esquina esperados: 5.1 | 5.5`, `Total de tiros de esquina: 10.6`, `Faltas esperadas: 11.8 | 10.3`, barras 1X2 `34% / 26% / 40%`) seguido del análisis narrativo estructurado en secciones (`Resumen`, `Goles`, `Tiros de esquina`, `Faltas`, `Contexto`, `A tener en cuenta`).
  - Captura: [02-partido-pronostico-ia.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/screenshots/02-partido-pronostico-ia.png)
- **Partido próximo de selecciones (`1528974` — Portugal vs Denmark, UEFA Nations League):**
  - Verificó el fallback automático de clasificación: `GET /rest/v1/standings?league_id=eq.5&season=eq.2024` devolvió `[]`, disparando `POST /functions/v1/league-standings` (`{"league_id": 5, "season": 2024}`), que retornó los 14 grupos completos de UEFA Nations League.
- **Partido finalizado con xG (`1570024` — Valladolid 0–1 Castellón, Segunda División de España):**
  - En `Estadísticas`, renderiza `API-Sports · Actualizado 11:36 a.m.` con barras comparativas y botón individual `☆ Seguir` junto a cada métrica: `Goles esperados (xG): 0.82 vs 1.76`, `Pases completados: 324 vs 453`, `Tiros totales: 7 vs 15`, `Tiros de esquina: 3 vs 9`, `Posesión: 42% vs 58%`.
  - Captura: [09-futbol-finalizado-estadisticas-xg.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/screenshots/09-futbol-finalizado-estadisticas-xg.png)
- **Partido finalizado con `astra_picks` activo y Momento del Partido (`1636276` — Juventus 2–2 Rennes, UEFA Europa League):**
  - Devolvió un pick curado no vacío en `astra_picks`: `[{"pick": "Más de 8.5 tiros de esquinas"}]` y renderizó el gráfico `Momento del partido` (`"Presión estimada a partir de tiros y córners. Solo intervalos observados."`) con barras verdes/moradas e íconos circulares en los minutos de gol (`0'`–`91'`).
  - Captura: [10-futbol-momento-partido.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/screenshots/10-futbol-momento-partido.png)

### 4.2 Deportes US (`/nba`, `/nhl`, `/nfl`, `/mlb`)

- **NBA (`/juego/nba/401909980` upcoming Nuggets @ Pelicans y `/juego/nba/401909296` final Knicks 104–106 Pacers):**
  - Redirige en escritorio a `/nba?juego=<id>`.
  - En `Análisis con IA` (`401909296`), muestra la proyección pre-partido (`Probabilidad de victoria, con prórroga: 29% Pacers vs 71% Knicks`, `Puntos esperados: 106.2 – 113.0`, `Total: 219.2`, `Margen esperado: New York Knicks por 6.8`, `Prórroga: 5%`) y 5 bloques narrativos incluyendo advertencia explícita de bajas (`Tyrese Haliburton baja confirmada`).
  - En `Estadísticas` (`401909296`), debajo de las estadísticas colectivas de ESPN aparece la tarjeta **`Jugadores` (`Estadísticas individuales del partido`)** alimentada por `POST /functions/v1/nba-players`, con selector `Ordenar por: Puntos | Rebotes | Asistencias`, separación `Titulares` / `Banca` / `No jugaron` y filas desplegables (`aria-label="Estadísticas de Pascal Siakam"`). Al expandir a `Pascal Siakam (#43 · F)`, muestra cuadrícula de **14 métricas individuales** (`Minutos 32`, `Puntos 19`, `Rebotes 3`, `Asistencias 2`, `Robos 0`, `Bloqueos 0`, `Pérdidas 3`, `Faltas 4`, `Rebotes ofensivos 1`, `Rebotes defensivos 2`, `+/- -6`, `Tiros de campo 5/13 38.5%`, `Triples 2/4 50.0%`, `Tiros libres 7/12 58.3%`).
  - Captura: [03-nba-juego-jugadores.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/screenshots/03-nba-juego-jugadores.png)
- **NHL (`/juego/nhl/2026020312` upcoming Jets @ Blackhawks y `/juego/nhl/2026020310` final Rangers 5–1 Canucks):**
  - En `Análisis con IA` (`2026020312`), muestra `Goles esperados: Chicago Blackhawks 2.69 | Winnipeg Jets 3.02`, `Más de 5.5 goles: 46%`, `Más de 6.5 goles: 37%`, `Ambos anotan en tiempo regular: 86%`, `Empate en tiempo regular: 21%`, `Total de tiros a puerta: 27`, `Porteros: Spencer Knight – Stuart Skinner` y victoria total con OT/SO (`45% vs 55%`).
  - En `2026020310` (`final`), `match_live` entrega 10 métricas oficiales de `nhle.com` (`sog`, `faceoffWinningPctg`, `powerPlay`, `pim`, `hits`, `blockedShots`, `giveaways`, `takeaways`) y eventos de goles/penalizaciones.
  - Captura: [04-nhl-juego.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/screenshots/04-nhl-juego.png)
- **NFL (`/nfl` cambio de fecha al domingo `2026-11-15` y lunes `2026-11-16` + detalle `401873063`):**
  - En sábado `2026-11-14`, `/nfl` muestra `0 partidos`.
  - Al avanzar un día (`Día siguiente` → `/nfl?fecha=2026-11-15`), aparecen **12 juegos dominicales de Semana 10**, **todos con insignia `+ IA`** (`forecast_ready: true, analysis_ready: true`).
  - Al seleccionar `San Francisco 49ers en Dallas Cowboys, 3:25 p.m.` (`/nfl?fecha=2026-11-15&juego=401873063`), se cargan cuotas DraftKings (`2.80` DAL / `1.46` SF), tabla divisional/conferencia de NFL y en `Análisis con IA`: `Puntos esperados: Dallas Cowboys 25.6 | San Francisco 49ers 32.0`, `Total de puntos: 57.6`, `Más de 57.5 puntos: 50%`, `Margen esperado: San Francisco 49ers por 6.5`, `Hándicap SF -5.5: 53%`, `Probabilidad de victoria: 31% vs 69%`, más análisis de QBs titulares (`Brock Purdy 0.082 EPA/dropback` vs `Dak Prescott 0.056 EPA/dropback`).
  - Al avanzar un día más (`/nfl?fecha=2026-11-16`, Monday Night Football), aparece `Los Angeles Chargers en Baltimore Ravens` (`401873065`) **sin insignia `+ IA`** (`forecast_ready: false, analysis_ready: false`), confirmando que el pipeline batch de NFL genera pronósticos en una ventana rodante de ~36–48 horas antes del kickoff.
  - Captura: [05-nfl-cartelera-o-juego.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/screenshots/05-nfl-cartelera-o-juego.png)
- **MLB (`/mlb` en temporada baja, noviembre 2026):**
  - Muestra `Partidos · 0 partidos` y el estado vacío `"Aún no hay partidos de MLB con pronóstico de IA para este día."`
  - Captura: [12-mlb-temporada-baja.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/screenshots/12-mlb-temporada-baja.png)

### 4.3 Perfiles de Equipo, Historial y Páginas Institucionales

- **Perfiles de Equipo (`/equipo/[sport]/[id]`):**
  - Renderizan vista centrada (`maxWidth: 720 px`) con dos pestañas (`Resumen` y `Últimos partidos`).
  - En `Resumen` muestran 3 tarjetas:
    1. **`Datos del modelo`** (exclusiva para cuentas con acceso vía `fetchTeamModel`):
       - `/equipo/futbol/2282` (**Monterrey**): 9 medias ajustadas frente a rival promedio (`Goles a favor 1.52`, `Goles recibidos 1.35`, `Córners a favor 5.61`, `Córners recibidos 4.50`, `Faltas cometidas 11.69`, `Faltas recibidas 11.83`, `Tiros totales 14.69`, `Tiros a puerta 5.28`, `Tarjetas amarillas 1.97`, muestra de `15` partidos actuales + `38` anteriores). Captura: [06-equipo-perfil.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/screenshots/06-equipo-perfil.png)
       - `/equipo/nba/18` (**New York Knicks**): `Ofensa -2.80`, `Defensa 6.66`, `Rating neto 3.86`, `Elo 1660.60`.
       - `/equipo/nhl/16` (**Chicago Blackhawks**): 6 métricas por 60 min (`xG 5v5`, `Tiros a puerta`, `xG power play`, `xG en inferioridad`).
       - `/equipo/nfl/12` (**Kansas City Chiefs**): `Ataque 0.20`, `Defensa 3.10`, `EPA por jugada en ataque 0.06`, `EPA por jugada que evita la defensa 0.02`, `Elo 1561.00`. Captura: [11-equipo-nfl-modelo-epa.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/screenshots/11-equipo-nfl-modelo-epa.png)
       - `/equipo/mlb/119` (**Los Angeles Dodgers**): `"Todavía no hay una evaluación del modelo disponible para tu acceso."` (sin filas en `games` de MLB con `forecast_ready: true`), pero sí carga `Promedios recientes` (`Carreras anotadas 4.05`, `Carreras recibidas 2.85` en 20 juegos de postemporada/cierre 2026) e `Información del equipo` (`UNIQLO Field at Dodger Stadium`, `Dave Roberts`, `1884`). Captura: [14-equipo-mlb-dodgers.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/screenshots/14-equipo-mlb-dodgers.png)
    2. **`Promedios recientes`**: últimos 20 partidos finalizados devueltos por `team-profile`.
    3. **`Información del equipo`**: `Estadio`, `Entrenador`, `País`, `Ciudad`, `Fundación`.
- **Historial (`/historial/[sport]/[teamId]/[matchId]`):**
  - Se verificaron **ambas ramas** de `mod_0760`:
    1. **Rama almacenada (`stored: true`):** `/historial/nba/18/401909296` invoca `team-profile` con `{"sport":"nba","team_id":18,"match_id":401909296}`, recibe `{"stored": true}` y monta directamente `SportDetail` completo (incluyendo pronóstico y análisis IA histórico).
    2. **Rama externa bajo demanda (`stored: false`):** `/historial/nfl/12/401873006` (Chiefs 22–6 Chargers del `2026-10-18`) recibe `{stored: false, match, live}` desde `team-profile` y renderiza el visor histórico de 2 pestañas (`Detalles` con `Momento del partido` de anotaciones minuto a minuto + `Eventos del partido`, y `Estadísticas` con 18 métricas de yardas, eficiencia en 3ra/4ta oportunidad, zona roja y entregas de balón). Captura: [13-historial-nfl-externo.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/screenshots/13-historial-nfl-externo.png)
- **Cuenta (`/cuenta` autenticado):**
  - Muestra avatar con inicial `J`, nombre `Juan Pablo`, correo `laded35829@chuwel.com`, `"Miembro desde el 14 de noviembre de 2026"`, bloque `Suscripción` (`"Prueba gratis hasta el 21 de noviembre, 10:42 a.m."`, `"\$199 por 30 días de pronósticos y análisis de IA"`, botones `Pago con tarjeta` [Stripe] y `Mercado Pago`), y bloque inferior con `Cerrar sesión` y `Eliminar mi cuenta`.
  - Captura: [07-cuenta-acceso.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/screenshots/07-cuenta-acceso.png)
- **Siguiendo (`/siguiendo`):**
  - Confirma que el seguimiento de partidos y estadísticas **no usa tablas en Supabase**, sino almacenamiento local en dispositivo con límite de 6 estadísticas fijadas por partido y polling de 60 segundos mientras la app permanece abierta (`"No se envían avisos con la app cerrada"`).
- **Nosotros (`/nosotros`), Privacidad (`/privacidad`) y Términos (`/terminos`):**
  - `/nosotros` despliega 3 acordeones (`¿Cómo funciona la IA?`, `¿Los pronósticos son confiables?`, `¿Quiénes somos?`) y enlaces a Telegram (`https://t.me/+9jzp7DYLucM4MDYx`) e Instagram (`@astra_analysis`). Captura: [08-nosotros-metodologia.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/screenshots/08-nosotros-metodologia.png)
  - `/privacidad` y `/terminos` tienen fecha de actualización `20 de octubre de 2026`, contacto `eliasgutierrezhr@gmail.com`, requisito +18 años y descargo explícito de no ser casa de apuestas ni asesoría financiera.

---

## 5. Radiografía Técnica de los Payloads JSON Reales Capturados

Todos los payloads completos y libres de tokens están guardados en `Reportes/analisis-astra/evidence/live-payloads/`. A continuación se documenta la estructura real y los hallazgos técnicos más relevantes de cada uno.

### 5.1 Control de Acceso y Monetización (`my-access-sample.json`)
Archivo completo: [my-access-sample.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/my-access-sample.json)

```json
{
  "leagues": 48,
  "is_admin": false,
  "livemode": true,
  "logged_in": true,
  "price_mxn": 199,
  "has_access": true,
  "paid_until": null,
  "trial_days": 7,
  "iap_ios_key": null,
  "period_days": 30,
  "contact_email": "eliasgutierrezhr@gmail.com",
  "trial_ends_at": "2026-11-21T16:42:32.434382+00:00",
  "iap_product_id": "astra_30_dias",
  "iap_android_key": null
}
```
- **Hallazgo:** `iap_ios_key: null` e `iap_android_key: null` confirman que RevenueCat / IAP móvil aún no tiene llaves públicas activadas en producción, mientras Stripe y Mercado Pago operan en `livemode: true` a `\$199 MXN / 30 días` con `trial_days: 7` automáticos al registrarse.

### 5.2 Fútbol: Pronóstico `league_v3` Dixon–Coles + Binomial Negativa (`fixture-detail-sample.json`)
Archivo completo: [fixture-detail-sample.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/fixture-detail-sample.json) (`id: 1550951`, Club Querétaro vs Monterrey)

```json
{
  "model_mode": "league_v3",
  "lambda_home": 1.414,
  "lambda_away": 1.547,
  "p_home": 0.3404,
  "p_draw": 0.2601,
  "p_away": 0.3995,
  "btts": 0.6036,
  "over_05": 0.9403,
  "over_15": 0.8028,
  "over_25": 0.5679,
  "corners_home": 5.094,
  "corners_away": 5.51,
  "corners_total": 10.603,
  "fouls_home": 11.829,
  "fouls_away": 10.274,
  "fouls_total": 22.103,
  "context": {
    "home_league": {
      "rho": -0.07,
      "xg_weight": 0.7,
      "home_advantage_log": 0.2062,
      "goals_per_team_neutral": 1.424,
      "dispersion": {
        "fouls": 1.095,
        "shots": 1.708,
        "corners": 1.497,
        "yellow_cards": 1,
        "shots_on_target": 1.007
      }
    },
    "correct_score_top3": { "1-1": 0.1212, "1-2": 0.0876, "2-1": 0.08 }
  }
}
```
- **Hallazgo cuantitativo:** El payload expone directamente los hiperparámetros de Liga MX (`tournament_id: 262`): correlación de bajos marcadores Dixon–Coles $\rho = -0.07$, mezcla 70% xG / 30% goles reales (`xg_weight: 0.7`), ventaja local logarítmica `0.2062` y parámetros de sobredispersión binomial negativa por mercado (`shots: 1.708`, `corners: 1.497`, `fouls: 1.095`), además de que `analysis.sections` incluye 7 llaves (`resumen`, `goles`, `tiros_de_esquina`, `faltas`, `corners_faltas`, `contexto`, `a_tener_en_cuenta`).

### 5.3 Descubrimiento Crítico: `game_predictions.context` en Deportes US (NBA, NHL y NFL)

Mientras que `/juego/[sport]/[id]` solo descarga filas ya formateadas (`prediction.rows`), la consulta de `fetchTeamModel` en `/equipo/[sport]/[id]` descargó la columna **`game_predictions.context`** completa, revelando las fórmulas exactas del backend y el objeto `digest` que alimenta al LLM redactor:

1. **NBA** — [nba-game-detail-sample.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/nba-game-detail-sample.json) y [nba-model-context-sample.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/nba-model-context-sample.json):
   ```json
   "model_components": {
     "final_margin": -1.43,
     "margin_from_ratings": -0.73,
     "margin_from_elo": -3.52,
     "elo_blend_weight": 0.25,
     "rest_adjustment": 0,
     "league_avg_points": 113.58,
     "home_advantage_points": 1.967
   }
   ```
   - **Fórmula exacta verificada:** $\text{final\_margin} = 0.75 \times (-0.73) + 0.25 \times (-3.52) + 0 = -1.4275 \approx -1.43$. Además, `digest.bajas_reportadas` inyecta la lista de lesionados de ESPN (`Out` / `Day-To-Day`) únicamente para que el LLM redacte la advertencia en `"Descanso y bajas"` y `"A tener en cuenta"`, sin alterar el cálculo numérico.

2. **NHL** — [nhl-game-detail-sample.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/nhl-game-detail-sample.json) y [nhl-model-context-sample.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/nhl-model-context-sample.json):
   ```json
   "model_components": {
     "xg_away_60": 2.694,
     "xg_home_60": 2.427,
     "home_ice_ev5": 0.049,
     "goalie_goals_mult": { "away_goalie": 0.9907, "home_goalie": 0.9871 },
     "xg_breakdown_away": { "ev5": 2.357, "pp": 0.309, "sh": 0.014, "evo": 0.013 },
     "xg_model_validation": {
       "train_shots": 93598,
       "holdout_shots": 23094,
       "holdout_goals": 1586,
       "holdout_xg": 1574.3,
       "holdout_auc": 0.7477,
       "holdout_logloss": 0.22524,
       "baseline_logloss": 0.2502
     }
   }
   ```
   - **Hallazgo extraordinario:** El backend serializa dentro de cada predicción de NHL las métricas de validación holdout de su modelo propietario de xG por tiro (`93,598` tiros de entrenamiento, `23,094` de validación, `AUC = 0.7477`, `logloss = 0.22524`), junto con el desglose situacional (`ev5`, `pp`, `sh`, `evo`) y el multiplicador multiplicativo de portero (`origen: "most_starts"` cuando aún no hay portero confirmado).

3. **NFL** — [nfl-game-detail-sample.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/nfl-game-detail-sample.json) y [nfl-model-context-sample.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/nfl-model-context-sample.json):
   ```json
   "model_components": {
     "pesos": { "elo": 0.35, "epa": 0.3, "puntos": 0.35 },
     "ventaja_local": 0.8,
     "margen_elo": -4.23,
     "margen_epa": -4.35,
     "margen_puntos": -5.08,
     "qb_local": -0.1,
     "qb_visitante": 0.5,
     "descanso": 0,
     "techo_total": 0.65,
     "margen_final": -5.17,
     "total_final": 43.01
   }
   ```
   - **Fórmula exacta verificada:** $\text{margen\_final} = 0.35(-4.23) + 0.30(-4.35) + 0.35(-5.08) + (\text{qb\_local} - \text{qb\_visitante}) = -4.5635 + (-0.1 - 0.5) = -5.1635 \approx -5.17$, sumando además `+0.65` puntos al total esperado por estadio techado (`techo_total`).

### 5.4 Edge Functions y Tablas Auxiliares (`astra_picks`, `match-odds`, `nba-players`, `team-profile`, `league-standings`, `match_live`)

- **`astra-pick-sample.json`** ([ver archivo](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/astra-pick-sample.json)): Arreglo simple `[{"pick": "Más de 8.5 tiros de esquinas"}]` sin cuota ni stake numérico; funciona como sello editorial del pick oficial de Astra Analysis.
- **`match-odds-sample.json` y `match-odds-us-sports-sample.json`** ([Fútbol](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/match-odds-sample.json) | [US Sports](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/match-odds-us-sports-sample.json)): Estructura uniforme `{ "odds": { "home", "draw", "away", "bookmaker": { "id", "name" }, "updated_at" } }`. En deportes US los decimales sin redondear (`1.4587155963302751` = `-218` americano; `1.15625` = `-640` americano) demuestran conversión directa en la Edge Function desde momios americanos de DraftKings vía ESPN.
- **`nba-players-sample.json`** ([ver archivo](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/nba-players-sample.json)): `23 KB` con ambos planteles completos (`teams[].players[]`), banderas `starter`, `did_not_play`, `ejected`, `reason` y objeto `stats` de 14 llaves en string (`minutes`, `points`, `rebounds`, `assists`, `steals`, `blocks`, `turnovers`, `fouls`, `offensiveRebounds`, `defensiveRebounds`, `plusMinus`, `fieldGoals`, `threePointers`, `freeThrows`).
- **`team-profile-sample.json`, `mlb-team-profile-sample.json` y `historical-match-sample.json`** ([Fútbol](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/team-profile-sample.json) | [MLB](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/mlb-team-profile-sample.json) | [Historial externo](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/historical-match-sample.json)): Confirman cómo la Edge Function `team-profile` combina partidos almacenados en Supabase (`stored: true`) con historial paginado de 20 en 20 (`page`, `has_more`) consultado en caliente al proveedor externo (`stored: false`).

---

## 6. Inventario Completo de Archivos Generados

### Capturas PNG (`Reportes/analisis-astra/screenshots/`)
1. [01-home-futbol.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/screenshots/01-home-futbol.png) — Cartelera principal autenticada de Fútbol (`78 partidos`), barra de tendencias multi-deporte y ligas laterales.
2. [02-partido-pronostico-ia.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/screenshots/02-partido-pronostico-ia.png) — Pronóstico IA completo en Liga MX (`Club Querétaro vs Monterrey`).
3. [03-nba-juego-jugadores.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/screenshots/03-nba-juego-jugadores.png) — Tarjeta `Jugadores` de NBA (`nba-players`) con `Pascal Siakam` expandido (14 estadísticas individuales).
4. [04-nhl-juego.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/screenshots/04-nhl-juego.png) — Detalle y pronóstico IA de NHL (`Chicago Blackhawks vs Winnipeg Jets`).
5. [05-nfl-cartelera-o-juego.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/screenshots/05-nfl-cartelera-o-juego.png) — Cartelera dominical NFL (`2026-11-15`, 12 juegos con IA) + pronóstico IA de `Dallas Cowboys vs San Francisco 49ers`.
6. [06-equipo-perfil.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/screenshots/06-equipo-perfil.png) — Perfil de equipo `/equipo/futbol/2282` (`Monterrey`) con `Datos del modelo` y `Promedios recientes`.
7. [07-cuenta-acceso.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/screenshots/07-cuenta-acceso.png) — Pantalla `/cuenta` autenticada con trial activo de 7 días y opciones de suscripción (`\$199 MXN`).
8. [08-nosotros-metodologia.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/screenshots/08-nosotros-metodologia.png) — Pantalla `/nosotros` con metodología estadística e IA desplegada para los 5 deportes.
9. [09-futbol-finalizado-estadisticas-xg.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/screenshots/09-futbol-finalizado-estadisticas-xg.png) — Estadísticas post-partido con xG API-Sports (`Valladolid 0–1 Castellón`).
10. [10-futbol-momento-partido.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/screenshots/10-futbol-momento-partido.png) — Gráfico `Momento del partido` (`Juventus 2–2 Rennes`).
11. [11-equipo-nfl-modelo-epa.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/screenshots/11-equipo-nfl-modelo-epa.png) — Perfil NFL `/equipo/nfl/12` (`Kansas City Chiefs`) mostrando ratings de ataque/defensa, EPA/jugada y Elo.
12. [12-mlb-temporada-baja.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/screenshots/12-mlb-temporada-baja.png) — Estado vacío de `/mlb` en temporada baja (noviembre 2026).
13. [13-historial-nfl-externo.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/screenshots/13-historial-nfl-externo.png) — Ficha histórica externa `/historial/nfl/12/401873006` (`stored: false`, `Chiefs 22–6 Chargers`).
14. [14-equipo-mlb-dodgers.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/screenshots/14-equipo-mlb-dodgers.png) — Perfil MLB `/equipo/mlb/119` (`Los Angeles Dodgers` vía MLB StatsAPI).

### Payloads JSON Reales sin Tokens (`Reportes/analisis-astra/evidence/live-payloads/`)
- [fixture-detail-sample.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/fixture-detail-sample.json)
- [nba-game-detail-sample.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/nba-game-detail-sample.json)
- [nhl-game-detail-sample.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/nhl-game-detail-sample.json)
- [nfl-game-detail-sample.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/nfl-game-detail-sample.json)
- [astra-pick-sample.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/astra-pick-sample.json)
- [match-odds-sample.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/match-odds-sample.json)
- [match-odds-us-sports-sample.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/match-odds-us-sports-sample.json)
- [nba-players-sample.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/nba-players-sample.json)
- [team-profile-sample.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/team-profile-sample.json)
- [mlb-team-profile-sample.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/mlb-team-profile-sample.json)
- [historical-match-sample.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/historical-match-sample.json)
- [league-standings-sample.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/league-standings-sample.json)
- [football-standings-sample.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/football-standings-sample.json)
- [my-access-sample.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/my-access-sample.json)
- [nba-model-context-sample.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/nba-model-context-sample.json)
- [nhl-model-context-sample.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/nhl-model-context-sample.json)
- [nfl-model-context-sample.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/nfl-model-context-sample.json)
- [match-live-futbol-sample.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/match-live-futbol-sample.json)
- [match-live-nhl-sample.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/match-live-nhl-sample.json)
