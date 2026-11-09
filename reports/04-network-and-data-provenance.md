# 04 · Auditoría Forense de Procedencia de Datos (`Data Provenance`), Contratos de Red/APIs, Esquemas de Payloads y Motores Estadísticos de Statiskicks

- **Objetivo de la auditoría:** Determinar de manera irrefutable el origen de los datos estadísticos, eventos, identificadores y recursos multimedia de `https://www.statiskicks.com/`, documentar el catálogo completo de competiciones cubiertas, reconstruir los esquemas JSON de todos los contratos de red e hidratación SSR/Livewire, y auditar los modelos matemáticos/estadísticos derivados en backend (SKORE, percentiles posicionales, xT, xG Rolling, Momentum, redes de pases y proyecciones Monte Carlo).
- **Entorno de trabajo:** `c:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\REA-stats`
- **Clasificación epistémica:**
  - `[OBSERVADO]`: Evidencia directa extraída de payloads JSON, DOM/HTML capturado, cabeceras de red o código JavaScript/CSS servido sin minificar.
  - `[INFERIDO]`: Deducción técnica directa a partir de nombres de clases de backend filtrados, parámetros de llamadas RPC Livewire v3 o firmas de proveedores externos.
  - `[RECONSTRUIDO]`: Fórmula matemática o contrato de servicio reconstruido y verificado numéricamente contra los valores observados en los payloads.

---

## Índice de Evidencia REA Citada (`evidence_id`)

| # | Archivo de Captura (`evidence/captures/`) | `evidence_id` (SHA-256 REA) | URL / Escenario Capturado |
|---|---|---|---|
| 01 | `01-home-capture.json` / `01-home.html` | `ev_a57fa32050d099e784ee0a2f3d1e0f302a0c917dcc1a8c686b3c3b363666b0df` | `https://www.statiskicks.com/` (Landing & Bento Demos) |
| 02 | `02-search-api-capture.json` / `search-*.json` | `ev_296f62498cf90c3e87cd48ef454168c2d290f4a839a442208f9adfef04c8aeda` | `GET /search?q={america,messi,madrid}` |
| 03 | `03-team-capture.json` / `03-team.html` | `ev_aa5f2d74196b21062c132e8b6ec8934f023380f93c40f78f99e333a43bfc9977` | `/team/eu8c408f59yx7egaqossbv25e/club-america` |
| 04 | `04-player-capture.json` / `04-player.html` | `ev_59e57f74d8e4894a8c290cd1f58354701d398bea6301f1cdfe07edeeef89f945` | `/player/1cyhpfi77dom7gmpuownxlcrt/luis-romo` |
| 05 | `05-matches-capture.json` / `05-matches.html` | `ev_c5ee120c0b76e8a9fab5e7dbb9d324d0e932523cc84b2bc86cf9a3471b1f2118` | `https://www.statiskicks.com/matches` |
| 06 | `06-league-capture.json` / `06-league.html` | `ev_bc7ebac834b73578fd1ad9b68b2e5d06774bea085283377a605b1989ed3114af` | `/league/2hsidwomhjsaaytdy9u5niyi4` (Liga MX · Overview) |
| 07 | `07-players-capture.json` / `07-players.html` | `ev_e97046d53210bf233f1dc576a689f77283053071ff3e34bcc5c159f70a48d467` | `https://www.statiskicks.com/players` (Búsqueda avanzada) |
| 08 | `08-planes-capture.json` / `08-planes.html` | `ev_fba261f1679008e019d57771da85a84cf122769fdc93ab4a8088dfb8ed05ae76` | `https://www.statiskicks.com/planes` |
| 09 | `09-match-detail-capture.json` / `09-match-detail.html` | `ev_97e91618307b79c26283cb7092099714480742f83252e97a242081625f31cf52` | `/match/9dy7dhz5f13b2ejz2a5tok2l0` (Pumas 2-2 América · Resumen) |
| 10 | `10-leagues-capture.json` / `10-leagues.html` | `ev_643a343e34fadc05f5e77db59a547ec794b7b026f0f8da2458052732d6c28445` | `https://www.statiskicks.com/leagues` (Catálogo 40 ligas) |
| 11 | `11-login-capture.json` / `11-login.html` | `ev_29ff56dc035f280348f37506fb13b97ef5f91f78d023d03c699407f1af4a7cf2` | `https://www.statiskicks.com/login` |
| 12 | `12-register-capture.json` / `12-register.html` | `ev_045ab7e234fb4d11eef578d40992f5c0ce080058997d3af2b9bd60cda4e9bfcc` | `https://www.statiskicks.com/register` |
| 13 | `13-match-tabs-capture.json` / `13-match-tabs-wait-*.html` | `ev_1318b6ef36cbf6e763ddae14da0f95b3088da1ea954e8c8993b2994b188569fd` | Pestañas `alineaciones`, `estadisticas`, `eventos`, `datos` |
| 14 | `14-league-tabs-capture.json` / `14-league-tabs-wait-*.html` | `ev_bd430f00f4cc3e0cb3e7d1c12ddd223536657c09ba63ee662b710fb3bdab574a` | Pestañas `projection`, `maps`, `scatter`, `scout-ratings` |

---

## 1. Veredicto Forense sobre el Origen de los Datos (`Data Provenance`)

La arquitectura de datos de Statiskicks opera sobre un **modelo híbrido de doble proveedor con reconciliación de entidades en el backend Laravel**:

1. **Proveedor Primario de Estadísticas, Calendarios, Plantillas y Eventos On-Ball (`[OBSERVADO]`):** **Stats Perform / Opta Sports Data API (SDAPI)**.
2. **Proveedor Secundario de Fotografías de Jugadores, Escudos de Clubes/Ligas y Cross-Reference (`[OBSERVADO]`):** **API-Football (`v3.football.api-sports.io` / `media.api-sports.io`)**.
3. **Proveedor Terciario de Banderas Nacionales (`[OBSERVADO]`):** **FlagCDN (`https://flagcdn.com/w20/{iso}.png` y `w40`)**.

---

### 1.1. Pruebas Irrefutables del Proveedor Primario: Stats Perform / Opta SDAPI

#### A. Declaración Legal Explícita y Atribución en UI (`[OBSERVADO]`)
En todas las capturas HTML (`01-home.html` a `14-league-tabs-wait-*.html`), el pie de página legal y los subtítulos de las visualizaciones declaran textualmente:
- **Footer global:** `© 2026 Statiskicks. Todos los derechos reservados. Términos y Condiciones de uso · Aviso de privacidad integral · Datos de fútbol: Opta (Stats Perform).` (`03-team.html`, `09-match-detail.html`, `13-match-tabs-wait-estadisticas.html`).
- **Subtítulo del Radar de Equipo:** `El xT se calcula con un modelo público de amenaza esperada sobre los pases de Opta.` (`03-team.html`, `ev_aa5f2d74196b21062c132e8b6ec8934f023380f93c40f78f99e333a43bfc9977`).
- **Subtítulo de la Serie Histórica xG Rolling:** `54 partidos con xG · Fuente: Opta` (`03-team.html`).
- **Etiqueta de Normalización en Payload JSON:** En `03-team-data-team-profile-payload.json`, la métrica `pressing_intensity` (`PPDA`) lleva el atributo explícito `"normalization_label": "Valor Opta"`.

#### B. Filtración de Nombres de Clases PHP del Backend Laravel (`App\Services\Opta\*`) (`[OBSERVADO]`)
Los módulos JavaScript servidos sin minificar desde `/custom_assets/js/named/*.js` contienen comentarios de documentación interna que revelan la arquitectura exacta del backend Laravel y el namespace `App\Services\Opta\`:

| Archivo JS Frontend (`evidence/javascript/named/`) | Clase / Método Backend PHP Filtrado en Comentarios | Propósito del Servicio en Backend |
|---|---|---|
| `skore.js` (líneas 5–7) | `App\Services\Opta\OptaMatchRatingService::format()` y `::grade()` | Cálculo, formateo y clasificación por bandas (`low`, `mid`, `high`) del rating **SKORE**. |
| `attribute-charts.js` (línea 6) | `OptaSeasonStatsService::buildTraitsData()` | Construcción del catálogo de 147 atributos/traits por 90 min y totales para jugadores. |
| `attribute-charts.js` (línea 7) | `OptaTeamAttributeService::forTeam()` | Construcción del catálogo de 171 atributos/traits por partido y totales para equipos. |
| `team-xg-rolling.js` (línea 4) | `OptaTeamXgTimelineService` | Serie histórica móvil de 5 partidos (`window: 5`) de `xG`, `xGA` y cambios de DT. |
| `goalmouth-map.js` (línea 4) | `OptaKeeperGoalmouthService` | Mapa de portería (`goalmouthY` $\in [44.2, 55.8]$, `goalmouthZ` $\in [0, 38]$) para arqueros. |
| `event-map.js` (línea 277) | `OptaZoneControl` | Grilla táctica de control territorial por zonas (6 zonas en jugador, 24 zonas en partido). |
| `event-map.js` (línea 1743) | `OptaEventMapBuilder::summary()` | Agregación de eventos espaciales $(x, y)$, clusters K-means de pases y mapas de calor. |
| `percentile-rows.js` (línea 5) | `App\Support\RankBands::gradient()` | Gradientes cromáticos semafóricos para barras de percentiles (`0–100`). |
| `team-profile.js` (línea 4) | `App\Support\RankBands::third()` | Clasificación por tercios (`low`, `mid`, `high`) en el perfil táctico de equipo. |
| `attribute-charts.js` (línea 1178) | `AttributeRanking::view()` | Renderizado de tablas de ranking posicional y de equipo. |
| `event-map.js` (línea 522) | `PlanAccess::allowsMapEvent()` | Control de paywall por tipo de evento en mapas (`involvement`, `shot:*`, `pass:*`). |

#### C. Identificadores Universales Alfanuméricos de 25 Caracteres en Base-36 (Opta SDAPI UUIDs) (`[OBSERVADO]`)
Toda entidad de dominio en las URLs, atributos `wire:key`, llamadas Livewire y payloads JSON de Statiskicks utiliza como clave primaria el **UUID alfanumérico en base-36 (`[0-9a-z]{24,25}`) propio de Stats Perform / Opta Sports Data API (SDAPI)**:

| Tipo de Entidad Opta SDAPI | Campo en Statiskicks | Ejemplo Real Capturado | Entidad Representada | Evidencia Fuente |
|---|---|---|---|---|
| **Competición (`competition`)** | `competition_id` / `/league/{uuid}` | `2hsidwomhjsaaytdy9u5niyi4` | **Liga MX** (México) | `06-league.html`, `04-player-data-bootstrap.json` |
| **Competición (`competition`)** | `competition_id` / `/league/{uuid}` | `2kwbbcootiqqgmrzs6o5inle5` | **Premier League** (Inglaterra) | `10-leagues.html`, `search-madrid.json` |
| **Competición (`competition`)** | `competition_id` / `/league/{uuid}` | `34pl8szyvrbwcmfkuocjm3r6t` | **Primera División / LaLiga** (España) | `10-leagues.html`, `search-madrid.json` |
| **Competición (`competition`)** | `competition_id` / `/league/{uuid}` | `6by3h89i2eykc341oz7lv1ddd` | **Bundesliga** (Alemania) | `10-leagues.html`, `01-home.html` |
| **Competición (`competition`)** | `competition_id` / `/league/{uuid}` | `1r097lpxe0xn03ihb7wi98kao` | **Serie A** (Italia) | `10-leagues.html`, `01-home.html` |
| **Competición (`competition`)** | `competition_id` / `/league/{uuid}` | `dm5ka0os1e3dxcp3vh05kmp33` | **Ligue 1** (Francia) | `10-leagues.html`, `01-home.html` |
| **Competición (`competition`)** | `competition_id` / `/league/{uuid}` | `287tckirbfj9nb8ar2k9r60vn` | **MLS** (Estados Unidos) | `10-leagues.html`, `search-messi.json` |
| **Competición (`competition`)** | `competition_id` / `/league/{uuid}` | `581t4mywybx21wcpmpykhyzr3` | **Liga Profesional Argentina** | `10-leagues.html`, `01-home.html` |
| **Competición (`competition`)** | `competition_id` / `/league/{uuid}` | `scf9p4y91yjvqvg5jndxzhxj` | **Serie A / Brasileirão** (Brasil) | `10-leagues.html` (24 chars base-36) |
| **Temporada (`tournamentCalendar`)** | `season` / `season_tmcl` | `9zum4nxferygj8bb0ldcavxn8` | **Liga MX 2026/2027** | `03-team.html`, `04-player-data-bootstrap.json` |
| **Temporada (`tournamentCalendar`)** | `season` / `season_tmcl` | `aegyls91smdw9kipjgbsu8tn8` | **Liga MX 2025/2026** | `03-team.html`, `04-player-data-bootstrap.json` |
| **Club (`contestant`)** | `/team/{uuid}/{slug}` | `eu8c408f59yx7egaqossbv25e` | **Club América** (México) | `search-america.json`, `03-team.html` |
| **Club (`contestant`)** | `/team/{uuid}/{slug}` | `3kq9cckrnlogidldtdie2fkbl` | **Real Madrid** (España) | `search-madrid.json` |
| **Club (`contestant`)** | `/team/{uuid}/{slug}` | `4ku8o6uf87yd8iecdalipo6wd` | **Atlético de Madrid** (España) | `search-madrid.json` |
| **Club (`contestant`)** | `contestant_id` | `e603sojy77s4u0ypqds2v2a1g` | **Guadalajara / Chivas** (México) | `04-player-data-bootstrap.json` |
| **Club (`contestant`)** | `teams[].id` | `1aw67co8uut64yckd3wbhy9t2` | **Cruz Azul** (México) | `14-league-tabs-wait-maps-data-bootstrap.json` |
| **Jugador (`person` / `player`)** | `/player/{uuid}/{slug}` | `c5ryhn04g9goikd0blmh83aol` | **Lionel Messi** (Inter Miami) | `search-messi.json` |
| **Jugador (`person` / `player`)** | `/player/{uuid}/{slug}` | `1cyhpfi77dom7gmpuownxlcrt` | **Luis Romo** (Guadalajara) | `04-player.html` |
| **Jugador (`person` / `player`)** | `cards[uuid]` | `9sme7jykdv8msgfu0nxx6h39x` | **Keylor Navas** (Pumas UNAM) | `13-match-tabs-wait-alineaciones-json-0.json` |
| **Jugador (`person` / `player`)** | `/player/{uuid}/{slug}` | `54kcu71vtiz8xlkke60k394a1` | **Érick Sánchez** (Club América) | `03-team-data-team-age-profile-payload.json` |
| **Jugador (`person` / `player`)** | `/player/{uuid}/{slug}` | `5ysw10inm8syf7r9xvbpk9n11` | **Henry Martín** (Club América) | `03-team-data-team-age-profile-payload.json` |
| **Partido (`fixture` / `match`)** | `/match/{uuid}` | `9dy7dhz5f13b2ejz2a5tok2l0` | **Pumas UNAM 2-2 Club América** (J16 Apertura 2026) | `09-match-detail.html`, `13-match-tabs-capture.json` |

> [!IMPORTANT]
> En `04-player-data-bootstrap.json`, el campo `season_tmcl` expone explícitamente la nomenclatura oficial de Opta SDAPI (`tmcl` = **Tournament Calendar**), mapeando una clave compuesta `{competition_id}|{season_label}` a un arreglo de UUIDs de calendarios de torneo Opta (67 pares registrados para las ligas en las que ha participado el jugador o la base de datos activa).

#### D. Nombres Crudos de Métricas (`raw_name`) y Sistema de Coordenadas Opta $[0, 100] \times [0, 100]$ (`[OBSERVADO]`)
1. **Nombres crudos de feeds Opta (`raw_name`):** Tanto `03-team-data-attribute-charts-payload.json` (171 traits) como `04-player-data-attribute-charts-payload.json` (147 traits) conservan el campo `"raw_name"` con la etiqueta original en inglés del feed `TM3`/`TM4`/`F9` de Opta, junto a su traducción `"label"` al español:
   - `"raw_name": "Corners Taken (incl short corners)"` $\rightarrow$ `"label": "Córners cobrados (incl. cortos)"` (`key: "corners_taken_incl_short_corners"`).
   - `"raw_name": "Shots Created"` $\rightarrow$ `"label": "Tiros generados"` (`key: "shots_created"`).
   - `"raw_name": "Successful Open Play Passes"` $\rightarrow$ `"label": "Pases de juego abierto exitosos"` (`key: "successful_open_play_passes"`).
   - `"raw_name": "Tackles Won"` $\rightarrow$ `"label": "Entradas ganadas"` (`key: "tackles_won"`).
   - `"raw_name": "Duels won"` / `"Ground Duels won"` / `"Aerial Duels won"`.
2. **Coordenadas espaciales Opta $[0, 100] \times [0, 100]$ y Goalmouth $[44.2, 55.8] \times [0, 38]$ (`[OBSERVADO]`):**
   - En `event-map.js` (líneas 16–20), `team-pass-network.js`, `team-formation-profile.js` y `heatmap.js` (líneas 95–103), todas las coordenadas $(x, y)$ de eventos están expresadas en el sistema estándar de Opta $[0, 100] \times [0, 100]$ (donde $x \in [0, 100]$ va de línea de fondo propia a línea de fondo rival, e $y \in [0, 100]$ va de banda derecha a banda izquierda), proyectándose al canvas/SVG de cancha de $105 \times 68$ metros mediante:
     $$X_{\text{svg}} = \frac{x}{100} \times 105, \qquad Y_{\text{svg}} = \frac{100 - y}{100} \times 68$$
   - En `goalmouth-map.js` (líneas 15–17), el mapa de portería utiliza exactamente los calificadores de boca de portería de Opta (`Qualifier 102` = `Goalmouth Y`, `Qualifier 103` = `Goalmouth Z`):
     ```js
     // Opta goalmouth coordinates: y in ~[44.2, 55.8] (post to post, 55.8 = keeper's right / viewer's left),
     // z in [0, ~38] (ground to crossbar). Outside that = off-target.
     const Y_POST_LEFT = 55.8;
     const Y_POST_RIGHT = 44.2;
     const Z_CROSSBAR = 38.0;
     ```

---

### 1.2. Pruebas Irrefutables del Proveedor Secundario de Media y Cross-Reference: API-Football (`api-sports.io`)

Mientras que Opta SDAPI provee todos los UUIDs de entidades y las estadísticas/eventos, **Opta no incluye fotografías recortadas de jugadores ni escudos PNG listos para web en su paquete básico de feeds**. Para resolver esto, Statiskicks mantiene en su base de datos una tabla de mapeo cruzado (`opta_id` $\leftrightarrow$ `api_football_id`) contra **API-Football (`v3.football.api-sports.io`)** (`[OBSERVADO]`):

#### A. Fotografías de Jugadores Servidas Directamente desde el CDN de `media.api-sports.io` (`[OBSERVADO]`)
Las fotografías de jugadores apuntan directamente al CDN oficial de API-Football (`https://media.api-sports.io/football/players/{api_football_player_id}.png`):

| Jugador | UUID Opta en Statiskicks (`/player/{uuid}`) | URL de Fotografía (`image` / `photo`) | ID Entero API-Football | Evidencia Fuente |
|---|---|---|---|---|
| **Lionel Messi** | `c5ryhn04g9goikd0blmh83aol` | `https://media.api-sports.io/football/players/154.png` | `154` | `search-messi.json` (`ev_296f62...`) |
| **Trent Alexander-Arnold** | `6694fff742be1902267920726` | `https://media.api-sports.io/football/players/283.png` | `283` | `01-home.html` (`ev_a57fa3...`) |
| **Keylor Navas** | `9sme7jykdv8msgfu0nxx6h39x` | `https://media.api-sports.io/football/players/731.png` | `731` | `13-match-tabs-wait-alineaciones-json-0.json` |
| **Brahim Díaz** | `66b14855c9530871580964446` | `https://media.api-sports.io/football/players/744.png` | `744` | `01-home.html` |
| **Julián Álvarez** | `66b14850c9530871580954502` | `https://media.api-sports.io/football/players/6009.png` | `6009` | `01-home.html` |
| **Henry Martín** | `5ysw10inm8syf7r9xvbpk9n11` | `https://media.api-sports.io/football/players/35603.png` | `35603` | `09-match-detail.html`, `13-match-tabs-wait-alineaciones-json-0.json` |
| **Álex Zendejas** | `i5f7g3p3e0i6zwc2bc9eglw5` | `https://media.api-sports.io/football/players/35885.png` | `35885` | `09-match-detail.html`, `13-match-tabs-wait-alineaciones-json-0.json` |
| **Pablo Bennevendo** | `2mcy76o0t3fqqdwtvc0v2n42y` | `https://media.api-sports.io/football/players/35904.png` | `35904` | `13-match-tabs-wait-alineaciones-json-0.json` |
| **Luis Romo** | `1cyhpfi77dom7gmpuownxlcrt` | `https://media.api-sports.io/football/players/35970.png` | `35970` | `04-player.html` (`ev_59e57f...`) |
| **César Huerta** | `48anl4qgpl4f13hkdkc2u9jhl` | `https://media.api-sports.io/football/players/36111.png` | `36111` | `09-match-detail.html`, `13-match-tabs-wait-alineaciones-json-0.json` |

#### B. Escudos de Clubes y Logos de Ligas Espejados Localmente con IDs Canónicos de API-Football (`[OBSERVADO]`)
Los logos de competiciones y escudos de equipos se sirven desde el almacenamiento público de Laravel (`/storage/media/leagues/{id}.png` y `/storage/media/teams/{id}.png`), pero **los nombres de archivo `{id}.png` corresponden 1:1 con los IDs enteros canónicos de `v3.football.api-sports.io`**:

| Tipo | Entidad | UUID Opta SDAPI | Ruta de Imagen en Statiskicks | ID Entero API-Football | Evidencia Fuente |
|---|---|---|---|---|---|
| **Liga** | Premier League (Inglaterra) | `2kwbbcootiqqgmrzs6o5inle5` | `/storage/media/leagues/39.png` | `39` | `10-leagues.html` |
| **Liga** | Championship (Inglaterra) | `7ntvbsyq31jnzoqoa8850b9b8` | `/storage/media/leagues/40.png` | `40` | `10-leagues.html` |
| **Liga** | Ligue 1 (Francia) | `dm5ka0os1e3dxcp3vh05kmp33` | `/storage/media/leagues/61.png` | `61` | `10-leagues.html` |
| **Liga** | Serie A (Brasil) | `scf9p4y91yjvqvg5jndxzhxj` | `/storage/media/leagues/71.png` | `71` | `10-leagues.html` |
| **Liga** | Bundesliga (Alemania) | `6by3h89i2eykc341oz7lv1ddd` | `/storage/media/leagues/78.png` | `78` | `10-leagues.html` |
| **Liga** | Eredivisie (Países Bajos) | `akmkihra9ruad09ljapsm84b3` | `/storage/media/leagues/88.png` | `88` | `10-leagues.html` |
| **Liga** | Primeira Liga (Portugal) | `8yi6ejjd1zudcqtbn07haahg6` | `/storage/media/leagues/94.png` | `94` | `10-leagues.html` |
| **Liga** | Liga Profesional Argentina | `581t4mywybx21wcpmpykhyzr3` | `/storage/media/leagues/128.png` | `128` | `10-leagues.html` |
| **Liga** | Serie A (Italia) | `1r097lpxe0xn03ihb7wi98kao` | `/storage/media/leagues/135.png` | `135` | `10-leagues.html` |
| **Liga** | LaLiga / Primera División (España) | `34pl8szyvrbwcmfkuocjm3r6t` | `/storage/media/leagues/140.png` | `140` | `10-leagues.html` |
| **Liga** | MLS (EE. UU.) | `287tckirbfj9nb8ar2k9r60vn` | `/storage/media/leagues/253.png` | `253` | `10-leagues.html` |
| **Liga** | Liga MX (México) | `2hsidwomhjsaaytdy9u5niyi4` | `/storage/media/leagues/262.png` | `262` | `10-leagues.html` |
| **Liga** | Liga MX Femenil (México) | `7ut48s80k421xixh6ev5i6h62` | `/storage/media/leagues/673.png` | `673` | `10-leagues.html` |
| **Equipo** | América Mineiro (Brasil) | `6pt3ef592s2524322b18c982j` | `/storage/media/teams/125.png` | `125` | `search-america.json` |
| **Equipo** | Atlético de Madrid (España) | `4ku8o6uf87yd8iecdalipo6wd` | `/storage/media/teams/530.png` | `530` | `search-madrid.json` |
| **Equipo** | Real Madrid (España) | `3kq9cckrnlogidldtdie2fkbl` | `/storage/media/teams/541.png` | `541` | `search-madrid.json` |
| **Equipo** | América de Cali (Colombia) | `d9b21e4k2r3l0n5821y67g171` | `/storage/media/teams/1138.png` | `1138` | `search-america.json` |
| **Equipo** | Pumas UNAM (México) | `2ei66pjfsrr6uxqp1bywq31lo` | `/storage/media/teams/2286.png` | `2286` | `13-match-tabs-wait-alineaciones-json-0.json` |
| **Equipo** | Club América (México) | `eu8c408f59yx7egaqossbv25e` | `/storage/media/teams/2287.png` | `2287` | `search-america.json`, `03-team.html` |

---

## 2. Catálogo Completo de las 40 Ligas Cubiertas (`[OBSERVADO]`)

Extraído íntegramente de `10-leagues.html` (`ev_643a343e34fadc05f5e77db59a547ec794b7b026f0f8da2458052732d6c28445`) y verificado contra el menú global de `01-home.html` y `05-matches.html`. Statiskicks cubre exactamente **40 competiciones** divididas en **9 ligas abiertas en el plan gratuito (`Scout`)** y **31 ligas bloqueadas tras el paywall de pago (`Plus` · \$129 MXN/mes)**:

| # | Nombre de la Liga | País (`country`) | Código Bandera (`flagcdn`) | UUID Opta SDAPI (`league/{uuid}`) | ID Imagen API-Football (`/storage/media/leagues/{id}.png`) | Región | Acceso en Plan Gratuito (`Scout`) |
|---|---|---|---|---|---|---|---|
| 1 | **Premier League** | ENGLAND | `gb-eng` | `2kwbbcootiqqgmrzs6o5inle5` | `39` | Top Ligas / Europa | Abierta (`Scout`) |
| 2 | **Primera División (LaLiga)** | SPAIN | `es` | `34pl8szyvrbwcmfkuocjm3r6t` | `140` | Top Ligas / Europa | Abierta (`Scout`) |
| 3 | **Bundesliga** | GERMANY | `de` | `6by3h89i2eykc341oz7lv1ddd` | `78` | Top Ligas / Europa | Abierta (`Scout`) |
| 4 | **Serie A** | ITALY | `it` | `1r097lpxe0xn03ihb7wi98kao` | `135` | Top Ligas / Europa | Abierta (`Scout`) |
| 5 | **Ligue 1** | FRANCE | `fr` | `dm5ka0os1e3dxcp3vh05kmp33` | `61` | Top Ligas / Europa | Abierta (`Scout`) |
| 6 | **Liga MX** | MEXICO | `mx` | `2hsidwomhjsaaytdy9u5niyi4` | `262` | América | Abierta (`Scout`) |
| 7 | **Liga Profesional Argentina** | ARGENTINA | `ar` | `581t4mywybx21wcpmpykhyzr3` | `128` | América | Abierta (`Scout`) |
| 8 | **MLS** | USA | `us` | `287tckirbfj9nb8ar2k9r60vn` | `253` | América | Abierta (`Scout`) |
| 9 | **Serie A (Brasileirão)** | BRAZIL | `br` | `scf9p4y91yjvqvg5jndxzhxj` | `71` | América | Abierta (`Scout`) |
| 10 | **2. Bundesliga** | GERMANY | `de` | `722fdbecxzcq9788l6jqclzlw` | `79` | Europa | Bloqueada (`Plus`) |
| 11 | **Championship** | ENGLAND | `gb-eng` | `7ntvbsyq31jnzoqoa8850b9b8` | `40` | Europa | Bloqueada (`Plus`) |
| 12 | **Eredivisie** | NETHERLANDS | `nl` | `akmkihra9ruad09ljapsm84b3` | `88` | Europa | Bloqueada (`Plus`) |
| 13 | **First Division A (Pro League)** | BELGIUM | `be` | `4zwgbb66rif2spcoeeol2motx` | `144` | Europa | Bloqueada (`Plus`) |
| 14 | **HNL** | CROATIA | `hr` | `1b70m6qtxrp75b4vtk8hxh8c3` | `210` | Europa | Bloqueada (`Plus`) |
| 15 | **Premier League** | RUSSIA | `ru` | `3ab1uwtoyjopdj1y1fynyy9jg` | `235` | Europa | Bloqueada (`Plus`) |
| 16 | **Premiership** | SCOTLAND | `gb-sct` | `e21cf135btr8t3upw0vl6n6x0` | `179` | Europa | Bloqueada (`Plus`) |
| 17 | **Primeira Liga** | PORTUGAL | `pt` | `8yi6ejjd1zudcqtbn07haahg6` | `94` | Europa | Bloqueada (`Plus`) |
| 18 | **Primera División Femenina (Liga F)** | SPAIN | `es` | `5k620c7y6dlbmcm88dt3eb7t` | `142` | Europa (Femenil) | Bloqueada (`Plus`) |
| 19 | **Segunda División (LaLiga Hypermotion)** | SPAIN | `es` | `3is4bkgf3loxv9qfg3hm8zfqb` | `141` | Europa | Bloqueada (`Plus`) |
| 20 | **Serie B** | ITALY | `it` | `8ey0ww2zsosdmwr8ehsorh6t7` | `136` | Europa | Bloqueada (`Plus`) |
| 21 | **Super League** | SWITZERLAND | `ch` | `e0lck99w8meo9qoalfrxgo33o` | `207` | Europa | Bloqueada (`Plus`) |
| 22 | **Super League 1** | GREECE | `gr` | `c0r21rtokgnbtc0o2rldjmkxu` | `197` | Europa | Bloqueada (`Plus`) |
| 23 | **Superliga** | DENMARK | `dk` | `29actv1ohj8r10kd9hu0jnb0n` | `119` | Europa | Bloqueada (`Plus`) |
| 24 | **Süper Lig** | TÜRKIYE | `tr` | `482ofyysbdbeoxauk19yg7tdt` | `203` | Europa | Bloqueada (`Plus`) |
| 25 | **Women's Super League (WSL)** | ENGLAND | `gb-eng` | `6vq8j5p3av14nr3iuyi4okhjt` | `44` | Europa (Femenil) | Bloqueada (`Plus`) |
| 26 | **Division Profesional** | PARAGUAY | `py` | `5y0z0l2epprzbscvzsgldw8vu` | `250` | América | Bloqueada (`Plus`) |
| 27 | **Liga 1** | PERU | `pe` | `a9vrdkelbgif0gtu3wxsr75xo` | `281` | América | Bloqueada (`Plus`) |
| 28 | **Liga MX Femenil** | MEXICO | `mx` | `7ut48s80k421xixh6ev5i6h62` | `673` | América (Femenil) | Bloqueada (`Plus`) |
| 29 | **Liga de Expansión MX** | MEXICO | `mx` | `e1kxdivp5g4cpldgpwvnzl1vv` | `263` | América | Bloqueada (`Plus`) |
| 30 | **Liga Pro** | ECUADOR | `ec` | `6lwpjhktjhl9g7x2w7njmzva6` | `242` | América | Bloqueada (`Plus`) |
| 31 | **Primera A** | COLOMBIA | `co` | `2ty8ihceabty8yddmu31iuuej` | `239` | América | Bloqueada (`Plus`) |
| 32 | **Primera División** | CHILE | `cl` | `2y8bntiif3a9y6gtmauv30gt` | `265` | América | Bloqueada (`Plus`) |
| 33 | **Primera División** | VENEZUELA | `ve` | `46b141eaqq9q7o4gz5gtdpikk` | `299` | América | Bloqueada (`Plus`) |
| 34 | **Serie B** | BRAZIL | `br` | `5zr0b05eyx25km7z1k03ca9jx` | `72` | América | Bloqueada (`Plus`) |
| 35 | **NWSL** | USA | `us` | `djkvh1luqdkdixpoe653lzixg` | `254` | América (Femenil) | Bloqueada (`Plus`) |
| 36 | **USL Championship** | USA | `us` | `c1d9p6b2e9zr5tqlzx3ktjplg` | `255` | América | Bloqueada (`Plus`) |
| 37 | **USL League One** | USA | `us` | `jznihqxle06xych9ygwiwnsa` | `489` | América | Bloqueada (`Plus`) |
| 38 | **MLS Next Pro** | USA | `us` | `5qmjkpvi92vrzdcb2knassjkk` | `909` | América | Bloqueada (`Plus`) |
| 39 | **Saudi League (Roshn Saudi League)** | SAUDI ARABIA | `sa` | `ea0h6cf3bhl698hkxhpulh2zz` | `307` | Asia | Bloqueada (`Plus`) |
| 40 | **Stars League** | QATAR | `qa` | `xaouuwuk8qyhv1libkeexwjh` | `305` | Asia | Bloqueada (`Plus`) |

---

## 3. Esquemas de Datos y Payloads por Dominio

Statiskicks emplea dos mecanismos de transporte de datos hacia el cliente (`[OBSERVADO]`):
1. **Hidratación inicial por atributos HTML `data-*` y bloques `<script type="application/json" x-ref="...">`:** Los componentes complejos en D3/SVG/Canvas (`attribute-charts.js`, `team-profile.js`, `team-xg-rolling.js`, `team-age-profile.js`, `team-formation-profile.js`, `momentum-chart.js`, `event-map.js`, `league-maps.js`) leen su estado inicial o serie completa desde un atributo HTML escapado con `htmlspecialchars`.
2. **Llamadas RPC asíncronas sobre Laravel Livewire v3 (`POST /livewire-e3175f40/update`) y endpoint REST ligero (`GET /search?q=`):** Cuando el usuario cambia de pestaña (`setTab`), solicita un mapa de eventos (`loadMapGraphData`, `loadLeagueMap`, `loadPlayerEvents`) o filtra un gráfico de dispersión (`loadScatter`), Alpine/Livewire invoca métodos públicos del componente PHP devolviendo ya sea nuevo HTML hidratado (`effects.html`) o un payload JSON directo (`effects.returns[0]`).

---

### 3.1. API de Búsqueda Global (`GET /search?q=...`) (`[OBSERVADO]`)

- **Evidencia:** `02-search-api-capture.json` (`ev_296f62498cf90c3e87cd48ef454168c2d290f4a839a442208f9adfef04c8aeda`), `search-america.json`, `search-messi.json`, `search-madrid.json` y el script `search-results-image.js` (`search-1794084628.json`).
- **Endpoint:** `GET https://www.statiskicks.com/search?q={query}` (requiere al menos 2 caracteres; devuelve un arreglo JSON plano de hasta ~10–15 coincidencias ordenadas por relevancia/popularidad).

#### Esquema JSON del Contrato `/search?q=`
```typescript
type SearchResponse = SearchResultItem[];

interface SearchResultItem {
  name: string;         // Nombre corto o completo (ej. "Club América", "Lionel Messi")
  type: "Equipo" | "Jugador" | "Liga"; // Tipo de entidad en español
  url: string;          // Ruta relativa canónica: "/team/{opta_uuid}/{slug}" | "/player/{opta_uuid}/{slug}" | "/league/{opta_uuid}"
  image: string | null; // URL absoluta: "/storage/media/teams/{api_sports_id}.png" o "https://media.api-sports.io/football/players/{api_sports_id}.png"
  meta: string;         // Subtítulo contextual: "{Liga}" para equipos, "{Posición_ES} · {Club}" para jugadores
  locked?: boolean;     // true si pertenece a una de las 31 ligas bloqueadas tras paywall Plus
}
```

#### Ejemplos Reales Capturados (`search-america.json`, `search-messi.json`, `search-madrid.json`)
```json
// GET /search?q=america (extracto de search-america.json)
[
  {
    "name": "Club América",
    "type": "Equipo",
    "url": "/team/eu8c408f59yx7egaqossbv25e/club-america",
    "image": "https://www.statiskicks.com/storage/media/teams/2287.png",
    "meta": "Liga MX"
  },
  {
    "name": "América de Cali",
    "type": "Equipo",
    "url": "/team/d9b21e4k2r3l0n5821y67g171/america-de-cali",
    "image": "https://www.statiskicks.com/storage/media/teams/1138.png",
    "meta": "Primera A",
    "locked": true
  },
  {
    "name": "América Mineiro",
    "type": "Equipo",
    "url": "/team/6pt3ef592s2524322b18c982j/america-mineiro",
    "image": "https://www.statiskicks.com/storage/media/teams/125.png",
    "meta": "Serie B",
    "locked": true
  }
]
```
```json
// GET /search?q=messi (extracto de search-messi.json)
[
  {
    "name": "Lionel Messi",
    "type": "Jugador",
    "url": "/player/c5ryhn04g9goikd0blmh83aol/lionel-messi",
    "image": "https://media.api-sports.io/football/players/154.png",
    "meta": "Delantero · Inter Miami"
  }
]
```
```json
// GET /search?q=madrid (extracto de search-madrid.json)
[
  {
    "name": "Real Madrid",
    "type": "Equipo",
    "url": "/team/3kq9cckrnlogidldtdie2fkbl/real-madrid",
    "image": "https://www.statiskicks.com/storage/media/teams/541.png",
    "meta": "Primera División"
  },
  {
    "name": "Atlético de Madrid",
    "type": "Equipo",
    "url": "/team/4ku8o6uf87yd8iecdalipo6wd/atletico-de-madrid",
    "image": "https://www.statiskicks.com/storage/media/teams/530.png",
    "meta": "Primera División"
  }
]
```

---

### 3.2. Payloads de Atributos, Radares y Barras Comparativas (`data-attribute-charts-payload`) (`[OBSERVADO]`)

- **Evidencia:**
  - Equipo: `03-team-data-attribute-charts-payload.json` (`119.5 KB`, `ev_aa5f2d74196b21062c132e8b6ec8934f023380f93c40f78f99e333a43bfc9977`) generado por `OptaTeamAttributeService::forTeam()`.
  - Jugador: `04-player-data-attribute-charts-payload.json` (`45.1 KB`, `ev_59e57f74d8e4894a8c290cd1f58354701d398bea6301f1cdfe07edeeef89f945`) generado por `OptaSeasonStatsService::buildTraitsData()`.
  - Consumidor JS: `evidence/javascript/named/attribute-charts.js`.

#### Esquema JSON de `data-attribute-charts-payload` (Equipo y Jugador)
```typescript
interface TeamAttributeChartsPayload {
  valueLabel: string; // Ej. "Club América"
  traits: TeamTraitItem[]; // Exactamente 171 métricas en 12 categorías
}

interface TeamTraitItem {
  key: string;                        // Identificador snake_case (ej. "shots_created", "expected_threat")
  label: string;                      // Nombre en español (ej. "Tiros generados", "xT (amenaza esperada)")
  raw_name: string;                   // Nombre original en inglés del feed Opta SDAPI (ej. "Shots Created")
  val: number;                        // Valor por partido del equipo (o porcentaje/ratio)
  benchmark: number;                  // Mejor valor de referencia en la liga
  percentile: number;                 // Percentil [0..100] con 2 decimales
  benchmark_percentile: number;
  population_average: number;         // Promedio de los 18 equipos de la liga
  population_average_percentile: number;
  visual_value: number;               // Valor visual normalizado (igual a percentile)
  min_range: number;                  // Mínimo observado en la liga
  max_range: number;                  // Máximo observado en la liga
  category: string;                   // Una de las 12 categorías tácticas
  defaultVisible: boolean;            // true en las 7 métricas del radar por defecto de equipo
  defaultOrder: number;
  lowerIsBetter: boolean;             // true cuando menos es mejor (ej. PPDA, xGA, pérdidas, tarjetas)
  unit: "per_match" | "percentage" | "ratio";
  bar_gradient: {
    percentile: { low: 30; mid_from: 50; mid_to: 60; high: 80 };
  };
  rank: number;                       // Posición en el ranking de la liga (1 = mejor)
  rank_total: number;                 // Total de equipos en la liga (ej. 18 en Liga MX)
  total: {                            // Misma estructura pero con acumulados totales del torneo
    val: number;
    benchmark: number;
    percentile: number;
    benchmark_percentile: number;
    population_average: number;
    population_average_percentile: number;
    min_range: number;
    max_range: number;
    rank: number;
    rank_total: number;
  };
}

interface PlayerAttributeChartsPayload {
  state: "ready" | "empty";
  traits: PlayerTraitItem[];          // Exactamente 147 métricas en 12 categorías
}

interface PlayerTraitItem {
  key: string;                        // Identificador snake_case
  label: string;                      // Etiqueta en español
  raw_name: string;                   // Etiqueta original en inglés de Opta SDAPI
  category: string;                   // Una de las 12 categorías de jugador
  defaultVisible: boolean;            // true en las 9 métricas por defecto según la posición (ej. DFCI)
  unit: "per_90" | "percentage";
  total_only: boolean;                // true en Apariciones, Titularidades, Cambios y Minutos jugados
  val: number;                        // Valor por 90 minutos (o porcentaje)
  population_average: number;         // Media de la cohorte posicional (>270 min en la liga)
  rank: number;                       // Puesto dentro de la cohorte posicional (ej. 1..76)
  rank_total: number;                 // Tamaño de la cohorte posicional (ej. 76 defensas en Liga MX)
  total: {
    val: number;                      // Valor acumulado total en la temporada
    population_average: number;
    rank: number;
    rank_total: number;
  };
}
```

#### A. Catálogo Completo de los 171 Traits de Equipo (`03-team-data-attribute-charts-payload.json` · Club América, Liga MX Apertura 2026/2027) (`[OBSERVADO]`)

| # | `key` | `label` (Español) | `raw_name` (Opta Inglés) | Categoría | Unidad | Menos es Mejor | Visible Radar Default | Valor (`val`) | Media Liga (`population_average`) | Percentil | Ranking |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `shots_created` | Tiros generados | `Shots Created` | Finalización | `per_match` | No | No | 14.44 | 11 | 94.12 | 2/18 |
| 2 | `goals` | Goles | `Goals` | Finalización | `per_match` | No | No | 2.38 | 1.46 | 100 | 1/18 |
| 3 | `home_goals` | Goles de local | `Home Goals` | Finalización | `per_match` | No | No | 0.94 | 0.78 | 76.47 | 4/18 |
| 4 | `away_goals` | Goles de visitante | `Away Goals` | Finalización | `per_match` | No | No | 1.44 | 0.68 | 100 | 1/18 |
| 5 | `goals_openplay` | Goles en jugada | `Goals Openplay` | Finalización | `per_match` | No | No | 1.56 | 0.92 | 94.12 | 2/18 |
| 6 | `goals_from_inside_box` | Goles dentro del área | `Goals from Inside Box` | Finalización | `per_match` | No | No | 1.94 | 1.2 | 94.12 | 2/18 |
| 7 | `goals_from_outside_box` | Goles fuera del área | `Goals from Outside Box` | Finalización | `per_match` | No | No | 0.44 | 0.2 | 100 | 1/18 |
| 8 | `headed_goals` | Goles de cabeza | `Headed Goals` | Finalización | `per_match` | No | No | 0.31 | 0.22 | 76.47 | 2/18 |
| 9 | `left_foot_goals` | Goles de pierna izquierda | `Left Foot Goals` | Finalización | `per_match` | No | No | 0.5 | 0.48 | 64.71 | 6/18 |
| 10 | `right_foot_goals` | Goles de pierna derecha | `Right Foot Goals` | Finalización | `per_match` | No | No | 1.5 | 0.7 | 100 | 1/18 |
| 11 | `penalty_goals` | Goles de penal | `Penalty Goals` | Finalización | `per_match` | No | No | 0.38 | 0.21 | 94.12 | 2/18 |
| 12 | `set_pieces_goals` | Goles de tiro libre directo | `Set Pieces Goals` | Finalización | `per_match` | No | No | 0.06 | 0.01 | 100 | 1/18 |
| 13 | `direct_corner_goals` | Goles olímpicos | `Direct Corner Goals` | Finalización | `per_match` | No | No | 0 | 0.01 | 0 | 4/18 |
| 14 | `direct_setpiece_goals` | Goles directos de balón parado | `Direct Setpiece Goals` | Finalización | `per_match` | No | No | 0.06 | 0.03 | 64.71 | 2/18 |
| 15 | `total_big_chances_scored` | Ocasiones claras convertidas | `Total Big Chances Scored` | Finalización | `per_match` | No | No | 1.31 | 0.91 | 94.12 | 2/18 |
| 16 | `defendergoals` | Goles de defensas | `defenderGoals` | Finalización | `per_match` | No | No | 0.13 | 0.1 | 52.94 | 5/18 |
| 17 | `midfieldergoals` | Goles de mediocampistas | `midfielderGoals` | Finalización | `per_match` | No | No | 0.88 | 0.52 | 88.24 | 2/18 |
| 18 | `forwardgoals` | Goles de delanteros | `forwardGoals` | Finalización | `per_match` | No | No | 0.88 | 0.54 | 88.24 | 3/18 |
| 19 | `subsgoals` | Goles de jugadores de cambio | `subsGoals` | Finalización | `per_match` | No | No | 0.5 | 0.24 | 88.24 | 2/18 |
| 20 | `goal_conversion` | Conversión de gol | `Goal Conversion` | Finalización | `percentage` | No | No | 17.12 | 13.08 | 100 | 1/18 |
| 21 | `shooting_accuracy` | Precisión de tiro (%) | `Shooting Accuracy` | Finalización | `percentage` | No | No | 51.35 | 43.07 | 100 | 1/18 |
| 22 | `totalscoringatt` | Tiros totales | `totalScoringAtt` | Finalización | `per_match` | No | No | 19.13 | 14.46 | 100 | 1/18 |
| 23 | `shots_on_target_inc_goals` | Tiros a puerta | `Shots On Target ( inc goals )` | Finalización | `per_match` | No | No | 7.13 | 4.83 | 100 | 1/18 |
| 24 | `total_big_chances_missed` | Ocasiones claras falladas | `Total Big Chances Missed` | Finalización | `per_match` | Sí | No | 1.19 | 1.5 | 82.35 | 3/18 |
| 25 | `attcorner` | Remates desde tiro de esquina | `attCorner` | Finalización | `per_match` | No | No | 2.88 | 2.49 | 82.35 | 4/18 |
| 26 | `atthdtotal` | Cabezazos totales | `attHdTotal` | Finalización | `per_match` | No | No | 2.69 | 2.87 | 41.18 | 11/18 |
| 27 | `attempts_from_set_pieces` | Remates de tiro libre directo | `Attempts from Set Pieces` | Finalización | `per_match` | No | No | 0.88 | 0.44 | 100 | 1/18 |
| 28 | `penalties_taken` | Penales cobrados | `Penalties Taken` | Finalización | `per_match` | No | No | 0.44 | 0.27 | 88.24 | 2/18 |
| 29 | `expected_goals` | Goles esperados (xG) | `Expected Goals` | Finalización | `per_match` | No | No | 1.97 | 1.51 | 94.12 | 2/18 |
| 30 | `non_penalty_expected_goals` | xG (excluyendo penales) | `Non-Penalty Expected Goals` | Finalización | `per_match` | No | No | 1.63 | 1.3 | 82.35 | 4/18 |
| 31 | `expected_goals_openplay` | xG en juego abierto | `Expected Goals Openplay` | Finalización | `per_match` | No | Sí | 1.18 | 0.99 | 82.35 | 4/18 |
| 32 | `expected_goals_left_foot` | xG pierna izquierda | `Expected Goals Left Foot` | Finalización | `per_match` | No | No | 0.5 | 0.44 | 76.47 | 5/18 |
| 33 | `expected_goals_right_foot` | xG pierna derecha | `Expected Goals Right Foot` | Finalización | `per_match` | No | No | 1.19 | 0.81 | 94.12 | 2/18 |
| 34 | `expected_goals_headed` | xG cabeceo | `Expected Goals Headed` | Finalización | `per_match` | No | No | 0.3 | 0.26 | 70.59 | 6/18 |
| 35 | `expected_goals_on_target` | xG a puerta (xGOT) | `Expected Goals On Target` | Finalización | `per_match` | No | No | 1.97 | 1.39 | 94.12 | 2/18 |
| 36 | `non_penalty_expected_goals_on_target` | xGOT (excluyendo penales) | `Non-Penalty Expected Goals On Target` | Finalización | `per_match` | No | No | 1.58 | 1.18 | 94.12 | 2/18 |
| 37 | `accuratecross` | Centros buenos | `accurateCross` | Creación | `per_match` | No | No | 4.75 | 4.68 | 52.94 | 6/18 |
| 38 | `accuratecrossnocorner` | Centros buenos sin contar córners | `accurateCrossNocorner` | Creación | `per_match` | No | No | 3.44 | 3.34 | 52.94 | 8/18 |
| 39 | `successful_crosses_open_play` | Centros buenos en jugada | `Successful Crosses open play` | Creación | `per_match` | No | No | 2.75 | 3.01 | 41.18 | 10/18 |
| 40 | `open_play_crosses` | Centros en jugada | `Open Play Crosses` | Creación | `per_match` | No | No | 12.44 | 13.42 | 35.29 | 12/18 |
| 41 | `crossing_accuracy` | Precisión de centros (%) | `Crossing Accuracy` | Creación | `percentage` | No | No | 27.27 | 24.78 | 88.24 | 3/18 |
| 42 | `goal_assists` | Asistencias de gol | `Goal Assists` | Creación | `per_match` | No | No | 1.44 | 0.98 | 88.24 | 3/18 |
| 43 | `goalassistintentional` | Asistencia intencional | `goalAssistIntentional` | Creación | `per_match` | No | No | 1.19 | 0.73 | 88.24 | 3/18 |
| 44 | `goalassistopenplay` | Asistencias en jugada | `goalAssistOpenplay` | Creación | `per_match` | No | No | 1.25 | 0.77 | 88.24 | 2/18 |
| 45 | `goalassistsetplay` | Asistencias ABP | `goalAssistSetplay` | Creación | `per_match` | No | No | 0.19 | 0.21 | 29.41 | 10/18 |
| 46 | `goalassistdeadball` | Asistencia directa ABP | `goalAssistDeadball` | Creación | `per_match` | No | No | 0 | 0.08 | 0 | 13/18 |
| 47 | `key_passes_attempt_assists` | Pases clave (ocasiones creadas) | `Key Passes (Attempt Assists)` | Creación | `per_match` | No | No | 13.13 | 10.02 | 94.12 | 2/18 |
| 48 | `attassistopenplay` | Pases a tiro en jugada | `attAssistOpenplay` | Creación | `per_match` | No | No | 11.25 | 8.52 | 94.12 | 2/18 |
| 49 | `attassistsetplay` | Pases a tiro derivados de balón parado | `attAssistSetplay` | Creación | `per_match` | No | No | 1.75 | 1.49 | 70.59 | 5/18 |
| 50 | `total_big_chances_created` | Ocasiones claras creadas | `Total Big Chances Created` | Creación | `per_match` | No | No | 1.44 | 1.73 | 23.53 | 12/18 |
| 51 | `totalthroughball` | Pases filtrados | `totalThroughBall` | Creación | `per_match` | No | No | 0.38 | 0.41 | 41.18 | 9/18 |
| 52 | `expected_assists` | Asistencias esperadas (xA) | `Expected Assists` | Creación | `per_match` | No | Sí | 1.1 | 0.97 | 82.35 | 4/18 |
| 53 | `expected_assists_openplay` | xA en juego abierto | `Expected Assists Openplay` | Creación | `per_match` | No | No | 0.97 | 0.87 | 76.47 | 5/18 |
| 54 | `expected_threat` | xT (amenaza esperada) | `Expected Threat` | Creación | `per_match` | No | Sí | 0.85 | 0.86 | 52.94 | 9/18 |
| 55 | `total_passes` | Pases totales | `Total Passes` | Pase | `per_match` | No | No | 461.5 | 427.26 | 64.71 | 7/18 |
| 56 | `total_successful_passes_excl_crosses_corners` | Pases completados | `Total Successful Passes ( Excl Crosses & Corners )` | Pase | `per_match` | No | No | 384.19 | 354.11 | 64.71 | 7/18 |
| 57 | `passing_accuracy` | Precisión de pase (%) | `Passing Accuracy` | Pase | `percentage` | No | No | 83.25 | 82.58 | 64.71 | 7/18 |
| 58 | `successful_open_play_passes` | Pases exitosos en jugada | `Successful Open Play Passes` | Pase | `per_match` | No | No | 363.56 | 333.7 | 64.71 | 7/18 |
| 59 | `successful_short_passes` | Pases cortos completados | `Successful Short Passes` | Pase | `per_match` | No | No | 354 | 327.94 | 64.71 | 7/18 |
| 60 | `successful_long_passes` | Pases largos completados | `Successful Long Passes` | Pase | `per_match` | No | No | 30.19 | 26.17 | 82.35 | 4/18 |
| 61 | `long_pass_accuracy` | Precisión de pase largo (%) | `Long Pass Accuracy` | Pase | `percentage` | No | No | 55.45 | 48.75 | 100 | 1/18 |
| 62 | `direct_play_share` | Juego directo (% de pases largos) | `Direct Play Share` | Pase | `percentage` | No | No | 11.8 | 12.82 | 41.18 | 11/18 |
| 63 | `fwdpass` | Pases hacia adelante | `fwdPass` | Pase | `per_match` | No | No | 150.5 | 143.32 | 70.59 | 6/18 |
| 64 | `backwardpass` | Pases hacia atrás | `backwardPass` | Pase | `per_match` | No | No | 66.06 | 62.68 | 70.59 | 6/18 |
| 65 | `leftsidepass` | Pases a la banda izquierda | `leftsidePass` | Pase | `per_match` | No | No | 119.56 | 109.83 | 64.71 | 7/18 |
| 66 | `rightsidepass` | Pases a la banda derecha | `rightsidePass` | Pase | `per_match` | No | No | 123.88 | 111.16 | 64.71 | 7/18 |
| 67 | `successful_passes_opposition_half` | Pases completados en campo rival | `Successful Passes Opposition Half` | Pase | `per_match` | No | No | 219.63 | 175.4 | 88.24 | 3/18 |
| 68 | `passing_opp_half` | Precisión de pase en campo rival (%) | `Passing % Opp Half` | Pase | `percentage` | No | No | 78.64 | 75.22 | 76.47 | 5/18 |
| 69 | `successful_passes_own_half` | Pases completados en campo propio | `Successful Passes Own Half` | Pase | `per_match` | No | No | 169.25 | 183.4 | 23.53 | 14/18 |
| 70 | `longpassowntooppsuccess` | Pases de campo propio a campo rival completados | `longPassOwnToOppSuccess` | Pase | `per_match` | No | No | 41.56 | 38.44 | 76.47 | 5/18 |
| 71 | `successfulfinalthirdpasses` | Pases completados al último tercio | `successfulFinalThirdPasses` | Pase | `per_match` | No | No | 106.06 | 79.63 | 88.24 | 3/18 |
| 72 | `accuratepullback` | Diagonales desde línea de fondo | `accuratePullBack` | Pase | `per_match` | No | No | 0.19 | 0.2 | 29.41 | 8/18 |
| 73 | `successful_dribbles` | Regates exitosos | `Successful Dribbles` | Posesión | `per_match` | No | No | 8.31 | 7.26 | 88.24 | 3/18 |
| 74 | `times_tackled` | Despojes de posesión | `Times Tackled` | Posesión | `per_match` | Sí | No | 19.19 | 16.25 | 5.88 | 17/18 |
| 75 | `unsuccessfultouch` | Controles erróneos | `unsuccessfulTouch` | Posesión | `per_match` | Sí | No | 18.5 | 17.72 | 29.41 | 13/18 |
| 76 | `total_losses_of_possession` | Pérdidas de posesión | `Total Losses Of Possession` | Posesión | `per_match` | Sí | No | 134.06 | 128.38 | 23.53 | 14/18 |
| 77 | `possession_loss_rate` | Pérdidas por 100 pases en juego | `Possession Loss Rate` | Posesión | `ratio` | Sí | No | 30.75 | 32.7 | 64.71 | 7/18 |
| 78 | `successful_lay_offs` | Descargas exitosas | `Successful Lay-offs` | Posesión | `per_match` | No | No | 5.75 | 5.12 | 58.82 | 7/18 |
| 79 | `possession_percentage` | Posesión (%) | `Possession Percentage` | Posesión | `percentage` | No | Sí | 56 | 49.58 | 82.35 | 4/18 |
| 80 | `touches` | Toques de balón | `Touches` | Posesión | `per_match` | No | No | 667.44 | 622.77 | 70.59 | 6/18 |
| 81 | `final_third_touches` | Toques en último tercio | `Final Third Touches` | Posesión | `per_match` | No | No | 180.5 | 145.82 | 88.24 | 3/18 |
| 82 | `total_touches_in_opposition_box` | Toques en el área rival | `Total Touches In Opposition Box` | Posesión | `per_match` | No | No | 27.38 | 21.54 | 94.12 | 2/18 |
| 83 | `totalfastbreak` | Contragolpes | `totalFastbreak` | Transición ofensiva | `per_match` | No | No | 1.81 | 1.2 | 88.24 | 3/18 |
| 84 | `goalfastbreak` | Goles de contragolpe | `goalFastbreak` | Transición ofensiva | `per_match` | No | No | 0.19 | 0.13 | 70.59 | 5/18 |
| 85 | `successfulfinalthirdentries` | Incursiones al último tercio exitosas | `successfulFinalThirdEntries` | Transición ofensiva | `per_match` | No | No | 41 | 33.6 | 88.24 | 3/18 |
| 86 | `successfulfinalthirdentriesopenplay` | Incursiones al último tercio en jugada exitosas | `successfulFinalThirdEntriesOpenPlay` | Transición ofensiva | `per_match` | No | No | 37.69 | 30.93 | 88.24 | 3/18 |
| 87 | `successfulpenareaentries` | Incursiones al área rival exitosas | `successfulPenAreaEntries` | Transición ofensiva | `per_match` | No | No | 12.5 | 10.27 | 82.35 | 4/18 |
| 88 | `tackles_won` | Entradas ganadas | `Tackles Won` | Defensa | `per_match` | No | No | 10.13 | 10.66 | 23.53 | 14/18 |
| 89 | `tackle_success` | Efectividad en entradas (%) | `Tackle Success` | Defensa | `percentage` | No | No | 67.5 | 64.6 | 88.24 | 3/18 |
| 90 | `last_player_tackle` | Entrada de último hombre | `Last Player Tackle` | Defensa | `per_match` | No | No | 0.13 | 0.16 | 35.29 | 10/18 |
| 91 | `interceptions` | Intercepciones | `Interceptions` | Defensa | `per_match` | No | No | 10 | 9.11 | 76.47 | 5/18 |
| 92 | `recoveries` | Recuperaciones | `Recoveries` | Defensa | `per_match` | No | No | 48.81 | 47.01 | 76.47 | 5/18 |
| 93 | `interceptionsinbox` | Intercepciones en el área | `interceptionsInBox` | Defensa | `per_match` | No | No | 0.31 | 0.61 | 0 | 15/18 |
| 94 | `posswondef3rd` | Recuperaciones en tercio propio | `possWonDef3rd` | Defensa | `per_match` | No | No | 17.63 | 17.55 | 52.94 | 9/18 |
| 95 | `posswonmid3rd` | Recuperaciones en tercio medio | `possWonMid3rd` | Defensa | `per_match` | No | No | 20.13 | 19.36 | 58.82 | 8/18 |
| 96 | `posswonatt3rd` | Recuperaciones en tercio rival | `possWonAtt3rd` | Defensa | `per_match` | No | No | 3.06 | 3.57 | 23.53 | 13/18 |
| 97 | `total_clearances` | Despejes exitosos | `Total Clearances` | Defensa | `per_match` | No | No | 20.31 | 24.33 | 11.76 | 16/18 |
| 98 | `clearances_off_the_line` | Balón sacado en la línea | `Clearances Off the Line` | Defensa | `per_match` | No | No | 0.19 | 0.06 | 88.24 | 3/18 |
| 99 | `blocks` | Remates bloqueados | `Blocks` | Defensa | `per_match` | No | No | 3.75 | 3.34 | 76.47 | 5/18 |
| 100 | `blockedpass` | Pases bloqueados | `blockedPass` | Defensa | `per_match` | No | No | 5.88 | 6.68 | 17.65 | 15/18 |
| 101 | `effectiveblockedcross` | Centros bloqueados con recuperación | `effectiveBlockedCross` | Defensa | `per_match` | No | No | 1.63 | 1.27 | 88.24 | 2/18 |
| 102 | `offsideprovoked` | Fueras de lugar provocados | `offsideProvoked` | Defensa | `per_match` | No | No | 1.44 | 1.67 | 52.94 | 9/18 |
| 103 | `goals_conceded` | Goles recibidos | `Goals Conceded` | Defensa | `per_match` | Sí | No | 1.44 | 1.52 | 58.82 | 7/18 |
| 104 | `goals_conceded_inside_box` | Goles recibidos desde dentro del área | `Goals Conceded Inside Box` | Defensa | `per_match` | Sí | No | 1.13 | 1.31 | 82.35 | 4/18 |
| 105 | `goals_conceded_outside_box` | Goles recibidos desde fuera del área | `Goals Conceded Outside Box` | Defensa | `per_match` | Sí | No | 0.31 | 0.21 | 17.65 | 13/18 |
| 106 | `penalty_goals_conceded` | Goles de penal recibidos | `Penalty Goals Conceded` | Defensa | `per_match` | Sí | No | 0.19 | 0.22 | 41.18 | 5/18 |
| 107 | `clean_sheets` | Portería en cero | `Clean Sheets` | Defensa | `per_match` | No | No | 0.25 | 0.21 | 41.18 | 5/18 |
| 108 | `clean_sheet_rate` | Porterías a cero (%) | `Clean Sheet Rate` | Defensa | `percentage` | No | No | 25 | 21.5 | 41.18 | 5/18 |
| 109 | `total_shots_conceded` | Tiros recibidos (total) | `Total Shots Conceded` | Defensa | `per_match` | Sí | No | 13.63 | 14.78 | 76.47 | 5/18 |
| 110 | `attemptsconcededibox` | Tiros recibidos desde dentro del área | `attemptsConcededIbox` | Defensa | `per_match` | Sí | No | 7.5 | 9 | 88.24 | 3/18 |
| 111 | `attemptsconcededobox` | Tiros recibidos desde fuera del área | `attemptsConcededObox` | Defensa | `per_match` | Sí | No | 6.06 | 5.83 | 35.29 | 12/18 |
| 112 | `ppda` | PPDA (intensidad de presión) | `PPDA` | Defensa | `ratio` | Sí | Sí | 10.1 | 12.99 | 94.12 | 2/18 |
| 113 | `number_of_opposition_passes` | Pases permitidos al rival | `Number of Opposition Passes` | Defensa | `per_match` | Sí | No | 275.56 | 325.96 | 94.12 | 2/18 |
| 114 | `number_of_defensive_actions` | Acciones defensivas | `Number of Defensive Actions` | Defensa | `per_match` | No | No | 27.31 | 25.54 | 58.82 | 8/18 |
| 115 | `expected_goals_conceded` | xG concedidos | `Expected Goals Conceded` | Defensa | `per_match` | Sí | No | 1.47 | 1.54 | 58.82 | 8/18 |
| 116 | `non_penalty_expected_goals_conceded` | xG concedidos (excluyendo penales) | `Non-Penalty Expected Goals Conceded` | Defensa | `per_match` | Sí | No | 1.22 | 1.32 | 70.59 | 6/18 |
| 117 | `open_play_expected_goals_conceded` | xG en juego abierto concedidos | `Open Play Expected Goals Conceded` | Defensa | `per_match` | Sí | Sí | 0.94 | 0.99 | 58.82 | 8/18 |
| 118 | `expected_goals_on_target_conceded` | xGOT concedidos | `Expected Goals On Target Conceded` | Defensa | `per_match` | Sí | No | 1.42 | 1.43 | 52.94 | 9/18 |
| 119 | `non_penalty_expected_goals_on_target_conceded` | xGOT concedidos (excluyendo penales) | `Non-Penalty Expected Goals On Target Conceded` | Defensa | `per_match` | Sí | No | 1.14 | 1.21 | 58.82 | 8/18 |
| 120 | `duels` | Duelos competidos | `Duels` | Duelos y regates | `per_match` | No | No | 104.44 | 96.76 | 88.24 | 3/18 |
| 121 | `duels_won` | Duelos ganados | `Duels won` | Duelos y regates | `per_match` | No | No | 52.31 | 48.36 | 94.12 | 2/18 |
| 122 | `duels_lost` | Duelos perdidos | `Duels lost` | Duelos y regates | `per_match` | Sí | No | 52.13 | 48.4 | 5.88 | 17/18 |
| 123 | `duel_success_rate` | Duelos ganados (%) | `Duel Success Rate` | Duelos y regates | `percentage` | No | No | 50.09 | 50 | 58.82 | 8/18 |
| 124 | `aerial_duels` | Duelos aéreos | `Aerial Duels` | Duelos y regates | `per_match` | No | No | 31.19 | 27.29 | 88.24 | 3/18 |
| 125 | `aerial_duels_won` | Duelos aéreos ganados | `Aerial Duels won` | Duelos y regates | `per_match` | No | Sí | 17.38 | 13.54 | 100 | 1/18 |
| 126 | `aerial_duel_success_rate` | Duelos aéreos ganados (%) | `Aerial Duel Success Rate` | Duelos y regates | `percentage` | No | No | 55.71 | 49.64 | 100 | 1/18 |
| 127 | `ground_duels` | Duelos por abajo | `Ground Duels` | Duelos y regates | `per_match` | No | No | 73.25 | 69.46 | 76.47 | 5/18 |
| 128 | `ground_duels_won` | Duelos por abajo ganados | `Ground Duels won` | Duelos y regates | `per_match` | No | No | 34.94 | 34.82 | 41.18 | 11/18 |
| 129 | `ground_duels_lost` | Duelos por abajo perdidos | `Ground Duels lost` | Duelos y regates | `per_match` | Sí | No | 38.31 | 34.65 | 5.88 | 17/18 |
| 130 | `accuratefreekickcross` | Centros de tiro libre buenos | `accurateFreekickCross` | Balón Parado | `per_match` | No | No | 0.63 | 0.33 | 88.24 | 3/18 |
| 131 | `corners_taken_incl_short_corners` | Córners cobrados | `Corners Taken (incl short corners)` | Balón Parado | `per_match` | No | No | 6.19 | 5.5 | 70.59 | 6/18 |
| 132 | `corners_won` | Tiros de esquina a favor | `Corners Won` | Balón Parado | `per_match` | No | No | 6.19 | 5.5 | 70.59 | 6/18 |
| 133 | `lostcorners` | Tiros de esquina en contra | `lostCorners` | Balón Parado | `per_match` | Sí | No | 5.31 | 5.55 | 58.82 | 8/18 |
| 134 | `successful_corners_into_box` | Córners al área buenos | `Successful Corners into Box` | Balón Parado | `per_match` | No | No | 1.31 | 1.4 | 35.29 | 12/18 |
| 135 | `totalthrows` | Saques de banda | `totalThrows` | Balón Parado | `per_match` | No | No | 21.06 | 20.08 | 76.47 | 5/18 |
| 136 | `throw_ins_to_own_player` | Saques de banda exitosos | `Throw Ins to Own Player` | Balón Parado | `per_match` | No | No | 17.38 | 16.02 | 64.71 | 7/18 |
| 137 | `attsetpiece` | Remates desde balón parado | `attSetpiece` | Balón Parado | `per_match` | No | No | 1.31 | 0.77 | 100 | 1/18 |
| 138 | `expected_goals_setpiece` | xG en jugadas a balón parado | `Expected Goals Setpiece` | Balón Parado | `per_match` | No | No | 0.45 | 0.3 | 94.12 | 2/18 |
| 139 | `expected_goals_free_kick` | xG en tiros libres directos | `Expected Goals Free Kick` | Balón Parado | `per_match` | No | No | 0.04 | 0.02 | 100 | 1/18 |
| 140 | `expected_goals_on_target_free_kick` | xGOT en tiros libres directos | `Expected Goals On Target Free Kick` | Balón Parado | `per_match` | No | No | 0.06 | 0.02 | 100 | 1/18 |
| 141 | `expected_assists_setpiece` | xA en jugadas a balón parado | `Expected Assists Setpiece` | Balón Parado | `per_match` | No | No | 0.13 | 0.1 | 64.71 | 7/18 |
| 142 | `saves` | Atajadas | `saves` | Portero | `per_match` | No | No | 3.13 | 3.47 | 17.65 | 14/18 |
| 143 | `savedobox` | Atajadas en tiros de fuera del área | `savedObox` | Portero | `per_match` | No | No | 1.63 | 1.36 | 82.35 | 3/18 |
| 144 | `bigchancesaves` | Ocasiones claras atajadas | `bigChanceSaves` | Portero | `per_match` | No | No | 1 | 0.66 | 100 | 1/18 |
| 145 | `penalties_saved` | Penales atajados | `Penalties Saved` | Portero | `per_match` | No | No | 0.13 | 0.05 | 82.35 | 2/18 |
| 146 | `drops` | Balones soltados | `Drops` | Portero | `per_match` | Sí | No | 0.25 | 0.09 | 0 | 17/18 |
| 147 | `totalhighclaim` | Salidas por balones aéreos | `totalHighClaim` | Portero | `per_match` | No | No | 0.94 | 0.54 | 82.35 | 3/18 |
| 148 | `goodhighclaim` | Centros atrapados | `goodHighClaim` | Portero | `per_match` | No | No | 0.75 | 0.45 | 76.47 | 5/18 |
| 149 | `totalkeepersweeper` | Acciones como líbero | `totalKeeperSweeper` | Portero | `per_match` | No | No | 0.31 | 0.49 | 23.53 | 11/18 |
| 150 | `accurategoalkicks` | Saques de meta buenos | `accurateGoalKicks` | Portero | `per_match` | No | No | 5.69 | 6.63 | 17.65 | 15/18 |
| 151 | `goals_prevented` | Goles prevenidos | `Goals Prevented` | Portero | `per_match` | No | No | -0.02 | -0.09 | 76.47 | 5/18 |
| 152 | `total_fouls_won` | Faltas recibidas | `Total Fouls Won` | Disciplina | `per_match` | No | No | 12 | 11.29 | 76.47 | 5/18 |
| 153 | `total_fouls_conceded` | Faltas cometidas | `Total Fouls Conceded` | Disciplina | `per_match` | Sí | No | 13.44 | 11.86 | 11.76 | 16/18 |
| 154 | `foul_won_penalty` | Penales provocados | `Foul Won Penalty` | Disciplina | `per_match` | No | No | 0.44 | 0.27 | 88.24 | 2/18 |
| 155 | `penalties_conceded` | Penales cometidos | `Penalties Conceded` | Disciplina | `per_match` | Sí | No | 0.31 | 0.27 | 35.29 | 10/18 |
| 156 | `handballs_conceded` | Manos | `Handballs conceded` | Disciplina | `per_match` | Sí | No | 0.81 | 0.57 | 11.76 | 16/18 |
| 157 | `dangerousplay` | Falta peligrosa | `dangerousPlay` | Disciplina | `per_match` | Sí | No | 0.13 | 0.04 | 0 | 18/18 |
| 158 | `offsides` | Fueras de lugar | `Offsides` | Disciplina | `per_match` | Sí | No | 1.31 | 1.68 | 82.35 | 4/18 |
| 159 | `yellow_cards` | Tarjetas amarillas | `Yellow Cards` | Disciplina | `per_match` | Sí | No | 1.81 | 1.86 | 52.94 | 8/18 |
| 160 | `red_card_2nd_yellow` | Roja por doble amarilla | `Red Card - 2nd Yellow` | Disciplina | `per_match` | Sí | No | 0.06 | 0.03 | 0 | 10/18 |
| 161 | `straight_red_cards` | Rojas directas | `Straight Red Cards` | Disciplina | `per_match` | Sí | No | 0.13 | 0.14 | 29.41 | 8/18 |
| 162 | `total_red_cards` | Tarjetas rojas | `Total Red Cards` | Disciplina | `per_match` | Sí | No | 0.19 | 0.17 | 29.41 | 9/18 |
| 163 | `errorleadtogoal` | Error que termina en gol | `errorLeadToGoal` | Errores | `per_match` | Sí | No | 0.13 | 0.13 | 41.18 | 7/18 |
| 164 | `errorleadtoshot` | Error que termina en tiro | `errorLeadToShot` | Errores | `per_match` | Sí | No | 0.31 | 0.23 | 11.76 | 12/18 |
| 165 | `own_goals_conceded` | Autogoles en contra | `Own Goals Conceded` | Errores | `per_match` | Sí | No | 0 | 0.06 | 100 | 1/18 |
| 166 | `own_goals_accrued` | Autogoles a favor | `Own Goals Accrued` | Errores | `per_match` | No | No | 0 | 0.06 | 0 | 9/18 |
| 167 | `subsmade` | Cambios realizados | `subsMade` | General | `per_match` | No | No | 4.75 | 4.71 | 52.94 | 9/18 |
| 168 | `totalsubon` | Jugadores que entraron de cambio | `totalSubOn` | General | `per_match` | No | No | 4.75 | 4.71 | 52.94 | 9/18 |
| 169 | `points_dropped_from_winning_positions` | Puntos perdidos en ventaja | `Points Dropped from Winning Positions` | General | `per_match` | Sí | No | 0.25 | 0.4 | 64.71 | 5/18 |
| 170 | `points_gained_from_losing_positions` | Puntos rescatados en desventaja | `Points Gained from Losing Positions` | General | `per_match` | No | No | 0.63 | 0.25 | 100 | 1/18 |
| 171 | `firsthalfgoals` | Goles en el primer tiempo | `firstHalfGoals` | General | `per_match` | No | No | 0.88 | 0.64 | 82.35 | 4/18 |

#### B. Catálogo Completo de los 147 Traits de Jugador (`04-player-data-attribute-charts-payload.json` · Luis Romo, DFCI, Guadalajara) (`[OBSERVADO]`)

| # | `key` | `label` (Español) | `raw_name` (Opta Inglés) | Categoría | Unidad | Solo Total (`total_only`) | Visible Radar Default | Valor p90 (`val`) | Media Posición (`population_average`) | Ranking Posicional |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `corners_taken_incl_short_corners` | Córners cobrados (incl. cortos) | `Corners Taken (incl short corners)` | Balón Parado | `per_90` | No | No | 0 | 0.02 | 7/76 |
| 2 | `direct_corner_goals` | Goles de córner directo | `Direct Corner Goals` | Balón Parado | `per_90` | No | No | 0 | 0 | 1/76 |
| 3 | `direct_setpiece_goals` | Goles directos de balón parado | `Direct Setpiece Goals` | Balón Parado | `per_90` | No | No | 0 | 0 | 1/76 |
| 4 | `expected_goals_setpiece` | xG en jugadas a balón parado | `Expected Goals Setpiece` | Balón Parado | `per_90` | No | No | 0.01 | 0.04 | 57/76 |
| 5 | `expected_goals_free_kick` | xG en tiros libres directos | `Expected Goals Free Kick` | Balón Parado | `per_90` | No | No | 0 | 0 | 4/76 |
| 6 | `successful_corners_into_box` | Córners exitosos al área | `Successful Corners into Box` | Balón Parado | `per_90` | No | No | 0 | 0 | 2/76 |
| 7 | `unsuccessful_corners_into_box` | Córners fallados al área | `Unsuccessful Corners into Box` | Balón Parado | `per_90` | No | No | 0 | 0.01 | 1/76 |
| 8 | `throw_ins_to_opposition_player` | Saques de banda al rival | `Throw Ins to Opposition Player` | Balón Parado | `per_90` | No | No | 1.37 | 0.62 | 64/76 |
| 9 | `throw_ins_to_own_player` | Saques de banda a compañero | `Throw Ins to Own Player` | Balón Parado | `per_90` | No | No | 4.78 | 1.74 | 9/76 |
| 10 | `attempts_from_set_pieces` | Remates de tiro libre directo | `Attempts from Set Pieces` | Balón Parado | `per_90` | No | No | 0 | 0.01 | 4/76 |
| 11 | `set_pieces_goals` | Goles de tiro libre directo | `Set Pieces Goals` | Balón Parado | `per_90` | No | No | 0 | 0 | 1/76 |
| 12 | `assists_intentional` | Asistencias intencionales | `Assists (Intentional)` | Creación | `per_90` | No | No | 0.17 | 0.02 | 4/76 |
| 13 | `expected_assists` | Asistencias esperadas (xA) | `Expected Assists` | Creación | `per_90` | No | No | 0.17 | 0.04 | 4/76 |
| 14 | `expected_assists_openplay` | xA en juego abierto | `Expected Assists Openplay` | Creación | `per_90` | No | No | 0.17 | 0.04 | 4/76 |
| 15 | `expected_assists_setpiece` | xA en jugadas a balón parado | `Expected Assists Setpiece` | Creación | `per_90` | No | No | 0 | 0 | 8/76 |
| 16 | `goal_assists` | Asistencias de gol | `Goal Assists` | Creación | `per_90` | No | No | 0.17 | 0.04 | 7/76 |
| 17 | `key_passes_attempt_assists` | Pases clave | `Key Passes (Attempt Assists)` | Creación | `per_90` | No | No | 1.45 | 0.34 | 3/76 |
| 18 | `second_goal_assists` | Segundas asistencias | `Second Goal Assists` | Creación | `per_90` | No | No | 0 | 0 | 3/76 |
| 19 | `successful_crosses_corners` | Centros y córners exitosos | `Successful Crosses & Corners` | Creación | `per_90` | No | No | 0.34 | 0.15 | 11/76 |
| 20 | `successful_crosses_open_play` | Centros exitosos de jugada | `Successful Crosses open play` | Creación | `per_90` | No | No | 0.34 | 0.15 | 11/76 |
| 21 | `through_balls` | Pases filtrados | `Through balls` | Creación | `per_90` | No | No | 0 | 0.02 | 14/76 |
| 22 | `total_big_chances_created` | Ocasiones claras creadas | `Total Big Chances Created` | Creación | `per_90` | No | No | 0.51 | 0.06 | 2/76 |
| 23 | `unsuccessful_crosses_corners` | Centros y córners fallados | `Unsuccessful Crosses & Corners` | Creación | `per_90` | No | No | 1.02 | 0.58 | 63/76 |
| 24 | `unsuccessful_crosses_open_play` | Centros fallados de jugada | `Unsuccessful Crosses open play` | Creación | `per_90` | No | No | 1.02 | 0.56 | 63/76 |
| 25 | `blocked_shots` | Remates bloqueados | `Blocked Shots` | Defensa | `per_90` | No | Sí | 0.17 | 0.16 | 31/76 |
| 26 | `blocks` | Bloqueos | `Blocks` | Defensa | `per_90` | No | No | 0.68 | 0.76 | 49/76 |
| 27 | `clearances_off_the_line` | Despejes sobre la línea | `Clearances Off the Line` | Defensa | `per_90` | No | No | 0 | 0.02 | 11/76 |
| 28 | `interceptions` | Intercepciones | `Interceptions` | Defensa | `per_90` | No | Sí | 1.71 | 1.27 | 16/76 |
| 29 | `last_player_tackle` | Entrada como último hombre | `Last Player Tackle` | Defensa | `per_90` | No | No | 0 | 0.03 | 21/76 |
| 30 | `own_goal_scored` | Autogol | `Own Goal Scored` | Defensa | `per_90` | No | No | 0 | 0.01 | 1/76 |
| 31 | `recoveries` | Recuperaciones | `Recoveries` | Defensa | `per_90` | No | Sí | 4.78 | 3.56 | 11/76 |
| 32 | `tackle_success_rate` | Efectividad de entradas | `Tackle Success Rate` | Defensa | `percentage` | No | No | 60.87 | 67.08 | 52/76 |
| 33 | `tackles_lost` | Entradas perdidas | `Tackles Lost` | Defensa | `per_90` | No | No | 0.77 | 0.5 | 65/76 |
| 34 | `tackles_won` | Entradas ganadas | `Tackles Won` | Defensa | `per_90` | No | Sí | 1.2 | 1.08 | 28/76 |
| 35 | `total_clearances` | Despejes totales | `Total Clearances` | Defensa | `per_90` | No | No | 3.67 | 4.76 | 57/76 |
| 36 | `total_tackles` | Entradas totales | `Total Tackles` | Defensa | `per_90` | No | No | 1.96 | 1.58 | 17/76 |
| 37 | `defensive_actions` | Acciones defensivas | `Defensive Actions` | Defensa | `per_90` | No | Sí | 7.26 | 7.88 | 49/76 |
| 38 | `putthroughblocked_distribution` | Saques bloqueados | `PutThrough/Blocked Distribution` | Defensa | `per_90` | No | No | 0.77 | 1.05 | 50/76 |
| 39 | `putthroughblocked_distribution_won` | Saques bloqueados recuperados | `PutThrough/Blocked Distribution Won` | Defensa | `per_90` | No | No | 0.17 | 0.51 | 70/76 |
| 40 | `penalties_conceded` | Penales cometidos | `Penalties Conceded` | Disciplina | `per_90` | No | No | 0.09 | 0.04 | 62/76 |
| 41 | `red_cards_2nd_yellow` | Roja por doble amarilla | `Red Cards - 2nd Yellow` | Disciplina | `per_90` | No | No | 0 | 0 | 1/76 |
| 42 | `straight_red_cards` | Rojas directas | `Straight Red Cards` | Disciplina | `per_90` | No | No | 0 | 0.02 | 1/76 |
| 43 | `total_red_cards` | Rojas totales | `Total Red Cards` | Disciplina | `per_90` | No | No | 0 | 0.02 | 1/76 |
| 44 | `total_fouls_conceded` | Faltas cometidas | `Total Fouls Conceded` | Disciplina | `per_90` | No | No | 1.28 | 1.09 | 50/76 |
| 45 | `yellow_cards` | Tarjetas amarillas | `Yellow Cards` | Disciplina | `per_90` | No | No | 0.09 | 0.16 | 30/76 |
| 46 | `aerial_duel_success_rate` | Efectividad de duelos aéreos | `Aerial Duel Success Rate` | Duelos | `percentage` | No | No | 60 | 56.89 | 30/76 |
| 47 | `duel_success_rate` | Efectividad de duelos | `Duel Success Rate` | Duelos | `percentage` | No | No | 53.27 | 56.47 | 50/76 |
| 48 | `duels` | Duelos | `Duels` | Duelos | `per_90` | No | No | 9.14 | 7.99 | 23/76 |
| 49 | `duels_lost` | Duelos perdidos | `Duels lost` | Duelos | `per_90` | No | No | 4.27 | 3.49 | 62/76 |
| 50 | `duels_won` | Duelos ganados | `Duels won` | Duelos | `per_90` | No | No | 4.87 | 4.5 | 29/76 |
| 51 | `ground_duel_success_rate` | Efectividad de duelos a ras de suelo | `Ground Duel Success Rate` | Duelos | `percentage` | No | No | 48.39 | 55.75 | 60/76 |
| 52 | `ground_duels` | Duelos a ras de suelo | `Ground Duels` | Duelos | `per_90` | No | No | 5.29 | 4.45 | 22/76 |
| 53 | `ground_duels_lost` | Duelos a ras de suelo perdidos | `Ground Duels lost` | Duelos | `per_90` | No | No | 2.73 | 2.01 | 62/76 |
| 54 | `ground_duels_won` | Duelos a ras de suelo ganados | `Ground Duels won` | Duelos | `per_90` | No | Sí | 2.56 | 2.44 | 29/76 |
| 55 | `errors_leading_to_goal` | Error que termina en gol | `Errors Leading to Goal` | Errores | `per_90` | No | No | 0.09 | 0.02 | 70/76 |
| 56 | `errors_leading_to_shot` | Error que termina en tiro | `Errors Leading to Shot` | Errores | `per_90` | No | No | 0 | 0.03 | 1/76 |
| 57 | `goal_conversion` | Conversión de gol | `Goal Conversion` | Finalización | `percentage` | No | No | 0 | 5.69 | 16/76 |
| 58 | `big_chance_conversion` | Conversión de ocasiones claras | `Big Chance Conversion` | Finalización | `percentage` | No | No | 0 | 11.93 | 13/76 |
| 59 | `expected_goals` | Goles esperados (xG) | `Expected Goals` | Finalización | `per_90` | No | No | 0.01 | 0.06 | 68/76 |
| 60 | `non_penalty_expected_goals` | xG (excluyendo penales) | `Non-Penalty Expected Goals` | Finalización | `per_90` | No | No | 0.01 | 0.05 | 68/76 |
| 61 | `expected_goals_on_target` | xG a puerta (xGOT) | `Expected Goals On Target` | Finalización | `per_90` | No | No | 0 | 0.03 | 48/76 |
| 62 | `non_penalty_expected_goals_on_target` | xGOT (excluyendo penales) | `Non-Penalty Expected Goals On Target` | Finalización | `per_90` | No | No | 0 | 0.03 | 48/76 |
| 63 | `expected_goals_openplay` | xG en juego abierto | `Expected Goals Openplay` | Finalización | `per_90` | No | No | 0 | 0.01 | 40/76 |
| 64 | `expected_goals_left_foot` | xG pierna izquierda | `Expected Goals Left Foot` | Finalización | `per_90` | No | No | 0.01 | 0.01 | 30/76 |
| 65 | `expected_goals_right_foot` | xG pierna derecha | `Expected Goals Right Foot` | Finalización | `per_90` | No | No | 0.01 | 0.02 | 35/76 |
| 66 | `goals` | Goles | `Goals` | Finalización | `per_90` | No | No | 0 | 0.02 | 16/76 |
| 67 | `non_penalty_goals` | Goles (excluyendo penales) | `Non-Penalty Goals` | Finalización | `per_90` | No | No | 0 | 0.02 | 15/76 |
| 68 | `non_penalty_goal_contributions` | Goles producidos (excluyendo penales) | `Non-Penalty Goal Contributions` | Finalización | `per_90` | No | No | 0.17 | 0.06 | 11/76 |
| 69 | `goals_from_inside_box` | Goles dentro del área | `Goals from Inside Box` | Finalización | `per_90` | No | No | 0 | 0.02 | 15/76 |
| 70 | `goals_from_outside_box` | Goles fuera del área | `Goals from Outside Box` | Finalización | `per_90` | No | No | 0 | 0 | 2/76 |
| 71 | `goals_openplay` | Goles de jugada | `Goals Openplay` | Finalización | `per_90` | No | No | 0 | 0 | 5/76 |
| 72 | `other_goals` | Otros goles | `Other Goals` | Finalización | `per_90` | No | No | 0 | 0 | 1/76 |
| 73 | `penalties_off_target` | Penales desviados | `Penalties Off Target` | Finalización | `per_90` | No | No | 0 | 0 | 1/76 |
| 74 | `penalties_taken` | Penales cobrados | `Penalties Taken` | Finalización | `per_90` | No | No | 0 | 0 | 2/76 |
| 75 | `penalty_goals` | Goles de penal | `Penalty Goals` | Finalización | `per_90` | No | No | 0 | 0 | 2/76 |
| 76 | `right_foot_goals` | Goles de pierna derecha | `Right Foot Goals` | Finalización | `per_90` | No | No | 0 | 0.01 | 8/76 |
| 77 | `shots_created` | Remates generados | `Shots Created` | Finalización | `per_90` | No | No | 1.62 | 0.38 | 3/76 |
| 78 | `shots_off_target_inc_woodwork` | Remates desviados (incl. palo) | `Shots Off Target (inc woodwork)` | Finalización | `per_90` | No | No | 0.17 | 0.37 | 17/76 |
| 79 | `shots_on_target_inc_goals` | Remates al arco (incl. goles) | `Shots On Target ( inc goals )` | Finalización | `per_90` | No | No | 0.09 | 0.14 | 44/76 |
| 80 | `total_big_chances_missed` | Ocasiones claras falladas | `Total Big Chances Missed` | Finalización | `per_90` | No | No | 0 | 0.06 | 1/76 |
| 81 | `total_big_chances_scored` | Ocasiones claras convertidas | `Total Big Chances Scored` | Finalización | `per_90` | No | No | 0 | 0.02 | 13/76 |
| 82 | `total_shots` | Remates totales | `Total Shots` | Finalización | `per_90` | No | No | 0.26 | 0.51 | 59/76 |
| 83 | `winning_goal` | Gol de la victoria | `Winning Goal` | Finalización | `per_90` | No | No | 0 | 0.01 | 6/76 |
| 84 | `appearances` | Partidos jugados | `Appearances` | General | `per_90` | Sí | No | 1.02 | 1.37 | 57/76 |
| 85 | `away_goals` | Goles de visitante | `Away Goals` | General | `per_90` | No | No | 0 | 0.01 | 9/76 |
| 86 | `foul_attempted_tackle` | Falta por intento de entrada | `Foul Attempted Tackle` | General | `per_90` | No | No | 0.26 | 0.49 | 22/76 |
| 87 | `games_played` | Partidos jugados | `Games Played` | General | `per_90` | Sí | No | 1.02 | 1.37 | 57/76 |
| 88 | `handballs_conceded` | Manos cometidas | `Handballs conceded` | General | `per_90` | No | No | 0.09 | 0.03 | 65/76 |
| 89 | `hit_woodwork` | Remates al palo | `Hit Woodwork` | General | `per_90` | No | No | 0 | 0.02 | 10/76 |
| 90 | `home_goals` | Goles de local | `Home Goals` | General | `per_90` | No | No | 0 | 0.01 | 11/76 |
| 91 | `left_foot_goals` | Goles de pierna izquierda | `Left Foot Goals` | General | `per_90` | No | No | 0 | 0.01 | 6/76 |
| 92 | `offsides` | Fueras de lugar | `Offsides` | General | `per_90` | No | No | 0 | 0.03 | 1/76 |
| 93 | `starts` | Titularidades | `Starts` | General | `per_90` | Sí | No | 1.02 | 0.99 | 28/76 |
| 94 | `substitute_off` | Salió de cambio | `Substitute Off` | General | `per_90` | Sí | No | 0.09 | 0.25 | 47/76 |
| 95 | `substitute_on` | Entró de cambio | `Substitute On` | General | `per_90` | Sí | No | 0 | 0.38 | 45/76 |
| 96 | `time_played` | Minutos jugados | `Time Played` | General | `per_90` | Sí | No | 90 | 90 | 1/76 |
| 97 | `aerial_duels` | Duelos aéreos | `Aerial Duels` | Juego Aéreo | `per_90` | No | No | 3.84 | 3.54 | 31/76 |
| 98 | `aerial_duels_lost` | Duelos aéreos perdidos | `Aerial Duels lost` | Juego Aéreo | `per_90` | No | No | 1.54 | 1.49 | 38/76 |
| 99 | `aerial_duels_won` | Duelos aéreos ganados | `Aerial Duels won` | Juego Aéreo | `per_90` | No | Sí | 2.31 | 2.05 | 30/76 |
| 100 | `offensive_aerial_duels` | Duelos aéreos ofensivos | `Offensive Aerial Duels` | Juego Aéreo | `per_90` | No | No | 1.02 | 1.05 | 35/76 |
| 101 | `offensive_aerial_duels_won` | Duelos aéreos ofensivos ganados | `Offensive Aerial Duels won` | Juego Aéreo | `per_90` | No | No | 0.77 | 0.56 | 22/76 |
| 102 | `offensive_aerial_duel_success_rate` | Efectividad de duelos aéreos ofensivos | `Offensive Aerial Duel Success Rate` | Juego Aéreo | `percentage` | No | No | 75 | 53.85 | 13/76 |
| 103 | `defensive_aerial_duels` | Duelos aéreos defensivos | `Defensive Aerial Duels` | Juego Aéreo | `per_90` | No | No | 2.82 | 2.42 | 26/76 |
| 104 | `defensive_aerial_duels_won` | Duelos aéreos defensivos ganados | `Defensive Aerial Duels won` | Juego Aéreo | `per_90` | No | No | 1.71 | 1.46 | 28/76 |
| 105 | `defensive_aerial_duel_success_rate` | Efectividad de duelos aéreos defensivos | `Defensive Aerial Duel Success Rate` | Juego Aéreo | `percentage` | No | No | 60.61 | 58.95 | 37/76 |
| 106 | `expected_goals_headed` | xG cabeceo | `Expected Goals Headed` | Juego Aéreo | `per_90` | No | No | 0 | 0.03 | 62/76 |
| 107 | `headed_goals` | Goles de cabeza | `Headed Goals` | Juego Aéreo | `per_90` | No | No | 0 | 0.01 | 7/76 |
| 108 | `backward_passes` | Pases hacia atrás | `Backward Passes` | Pase | `per_90` | No | No | 6.4 | 4.02 | 10/76 |
| 109 | `pass_accuracy` | Precisión de pase | `Pass Accuracy` | Pase | `percentage` | No | No | 86.01 | 85.2 | 36/76 |
| 110 | `forward_passes` | Pases hacia adelante | `Forward Passes` | Pase | `per_90` | No | Sí | 33.47 | 18.08 | 1/76 |
| 111 | `leftside_passes` | Pases a la izquierda | `Leftside Passes` | Pase | `per_90` | No | No | 13.66 | 12.73 | 35/76 |
| 112 | `open_play_passes` | Pases en jugada | `Open Play Passes` | Pase | `per_90` | No | No | 75.14 | 46.93 | 1/76 |
| 113 | `rightside_passes` | Pases por derecha | `Rightside Passes` | Pase | `per_90` | No | No | 24.59 | 14.02 | 5/76 |
| 114 | `successful_lay_offs` | Descargas exitosas | `Successful Lay-offs` | Pase | `per_90` | No | No | 0.09 | 0.04 | 16/76 |
| 115 | `successful_long_passes` | Pases largos exitosos | `Successful Long Passes` | Pase | `per_90` | No | Sí | 6.4 | 2.92 | 2/76 |
| 116 | `successful_open_play_passes` | Pases de juego abierto exitosos | `Successful Open Play Passes` | Pase | `per_90` | No | No | 64.47 | 40.24 | 1/76 |
| 117 | `successful_passes_opposition_half` | Pases exitosos en campo rival | `Successful Passes Opposition Half` | Pase | `per_90` | No | No | 31.76 | 15.29 | 1/76 |
| 118 | `successful_progressive_passes` | Pases progresivos exitosos | `Successful Progressive Passes` | Pase | `per_90` | No | No | 7.94 | 4.12 | 1/76 |
| 119 | `successful_passes_own_half` | Pases exitosos en campo propio | `Successful Passes Own Half` | Pase | `per_90` | No | No | 35.78 | 26.79 | 13/76 |
| 120 | `successful_short_passes` | Pases cortos exitosos | `Successful Short Passes` | Pase | `per_90` | No | No | 60.8 | 39.01 | 1/76 |
| 121 | `total_passes` | Pases totales | `Total Passes` | Pase | `per_90` | No | No | 78.13 | 48.85 | 1/76 |
| 122 | `total_successful_passes_excl_crosses_corners` | Pases exitosos (sin centros/córners) | `Total Successful Passes ( Excl Crosses & Corners )` | Pase | `per_90` | No | No | 67.2 | 41.93 | 1/76 |
| 123 | `total_unsuccessful_passes_excl_crosses_corners` | Pases fallados (sin centros/córners) | `Total Unsuccessful Passes ( Excl Crosses & Corners )` | Pase | `per_90` | No | No | 10.93 | 6.92 | 75/76 |
| 124 | `unsuccessful_lay_offs` | Descargas falladas | `Unsuccessful lay-offs` | Pase | `per_90` | No | No | 0 | 0.01 | 1/76 |
| 125 | `unsuccessful_long_passes` | Pases largos fallados | `Unsuccessful Long Passes` | Pase | `per_90` | No | No | 5.38 | 3.16 | 73/76 |
| 126 | `unsuccessful_passes_opposition_half` | Pases fallados en campo rival | `Unsuccessful Passes Opposition Half` | Pase | `per_90` | No | No | 9.14 | 5.34 | 74/76 |
| 127 | `unsuccessful_passes_own_half` | Pases fallados en campo propio | `Unsuccessful Passes Own Half` | Pase | `per_90` | No | No | 2.82 | 2.16 | 65/76 |
| 128 | `unsuccessful_short_passes` | Pases cortos fallados | `Unsuccessful Short Passes` | Pase | `per_90` | No | No | 5.55 | 3.76 | 73/76 |
| 129 | `carries` | Conducciones | `Carries` | Posesión | `per_90` | No | No | 14.94 | 10.91 | 8/76 |
| 130 | `corners_won` | Córners ganados | `Corners Won` | Posesión | `per_90` | No | No | 0.51 | 0.22 | 12/76 |
| 131 | `dribble_success_rate` | Efectividad de regates | `Dribble Success Rate` | Posesión | `percentage` | No | No | 28.57 | 44.39 | 46/76 |
| 132 | `final_third_touches` | Toques en último tercio | `Final Third Touches` | Posesión | `per_90` | No | No | 14.6 | 5.59 | 8/76 |
| 133 | `foul_won_penalty` | Penal ganado por falta | `Foul Won Penalty` | Posesión | `per_90` | No | No | 0 | 0.01 | 7/76 |
| 134 | `overruns` | Alargue de balón (pérdida) | `Overruns` | Posesión | `per_90` | No | No | 0 | 0.03 | 1/76 |
| 135 | `possession_retention` | Retención | `Possession Retention` | Posesión | `percentage` | No | No | 84.21 | 85.43 | 53/76 |
| 136 | `progressive_carries` | Conducciones progresivas | `Progressive Carries` | Posesión | `per_90` | No | No | 8.28 | 5.93 | 9/76 |
| 137 | `successful_dribbles` | Regates exitosos | `Successful Dribbles` | Posesión | `per_90` | No | No | 0.17 | 0.26 | 39/76 |
| 138 | `times_tackled` | Veces entrado | `Times Tackled` | Posesión | `per_90` | No | No | 0.85 | 0.47 | 63/76 |
| 139 | `total_fouls_won` | Faltas recibidas | `Total Fouls Won` | Posesión | `per_90` | No | No | 0.43 | 0.62 | 48/76 |
| 140 | `total_losses_of_possession` | Pérdidas de balón | `Total Losses Of Possession` | Posesión | `per_90` | No | No | 15.71 | 9.38 | 71/76 |
| 141 | `total_touches_in_opposition_box` | Toques en área rival | `Total Touches In Opposition Box` | Posesión | `per_90` | No | No | 1.28 | 0.95 | 16/76 |
| 142 | `touches` | Toques | `Touches` | Posesión | `per_90` | No | No | 99.48 | 65.26 | 1/76 |
| 143 | `unsuccessful_dribbles` | Regates fallados | `Unsuccessful Dribbles` | Posesión | `per_90` | No | No | 0.43 | 0.24 | 63/76 |
| 144 | `unsuccessful_touches` | Mal control | `Unsuccessful Touches` | Posesión | `per_90` | No | No | 0.85 | 0.63 | 58/76 |
| 145 | `expected_threat` | xT (amenaza esperada) | `Expected Threat` | Progresión | `per_90` | No | No | 0.28 | 0.09 | 1/76 |
| 146 | `expected_threat_passes` | xT por pases | `Expected Threat Passes` | Progresión | `per_90` | No | No | 0.26 | 0.08 | 1/76 |
| 147 | `expected_threat_carries` | xT por conducciones | `Expected Threat Carries` | Progresión | `per_90` | No | No | 0.02 | 0.01 | 11/76 |

---

### 3.3. Payloads Embebidos de Equipos (`03-team-*.json` y `03-team.html`) (`[OBSERVADO]`)

- **Evidencia:** `03-team-capture.json` (`ev_aa5f2d74196b21062c132e8b6ec8934f023380f93c40f78f99e333a43bfc9977`), `03-team.html`, y los 4 archivos extraídos en `evidence/network-schemas/03-team-data-*.json`.

#### A. Perfil Táctico e Identidad de Juego (`03-team-data-team-profile-payload.json` · 12.6 KB)
Consumido por `team-profile.js`, este payload contiene dos bloques:
1. `metrics` (31 métricas clave agrupadas en 9 dimensiones: `Finalización`, `Generación`, `Progresión`, `Circulación`, `Solidez defensiva`, `Duelos`, `Estilo`, `Recuperación`, `Balón parado`, `Disciplina`).
2. `identity` (10 rasgos estilísticos bipolares agrupados en las **4 fases del juego**: `Ataque posicional`, `Transición ofensiva`, `Organización defensiva`, `Transición defensiva`).

##### Tabla de las 31 Métricas de `data-team-profile-payload` (Club América · Apertura 2026/2027) (`[OBSERVADO]`)

| # | `key` | `label` (`short`) | Grupo | Valor Crudo (`raw`) | Valor (`value`) | Media Liga (`average`) | Ranking | Percentil | Normalización (`normalization_label`) | Menos es Mejor |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `goals_per_match` | Goles (`G/PJ`) | Finalización | 38 | 2.38 | 1.51 | 1/18 | 100 | Por partido | No |
| 2 | `goal_conversion` | Conversión de gol (`Conv%`) | Finalización | 17.1 | 17.1 | 13.3 | 1/18 | 100 | Porcentaje | No |
| 3 | `shooting_accuracy` | Precisión de tiro (`Tiro%`) | Finalización | 51.4 | 51.4 | 43.5 | 1/18 | 100 | Porcentaje | No |
| 4 | `shots_per_match` | Tiros (`T/PJ`) | Generación | 222 | 13.88 | 11.29 | 2/18 | 94.1 | Por partido | No |
| 5 | `shots_on_target_per_match` | Tiros a puerta (`TP/PJ`) | Generación | 114 | 7.13 | 4.96 | 1/18 | 97.1 | Por partido | No |
| 6 | `key_passes_per_match` | Pases clave (`PC/PJ`) | Generación | 210 | 13.13 | 10.19 | 2/18 | 94.1 | Por partido | No |
| 7 | `final_third_touches_per_match` | Toques en último tercio (`TUT/PJ`) | Progresión | 2888 | 180.5 | 147.8 | 3/18 | 88.2 | Por partido | No |
| 8 | `successful_opposition_passes_per_match` | Pases completados en campo rival (`PCR/PJ`) | Progresión | 3514 | 219.6 | 177.9 | 3/18 | 88.2 | Por partido | No |
| 9 | `opposition_pass_accuracy` | Precisión de pase en campo rival (`PCR%`) | Progresión | 78.6 | 78.6 | 75.4 | 5/18 | 76.5 | Porcentaje | No |
| 10 | `pass_accuracy` | Precisión de pase (`Pase%`) | Circulación | 83.3 | 83.3 | 82.6 | 7/18 | 64.7 | Porcentaje | No |
| 11 | `long_pass_accuracy` | Precisión de pase largo (`PL%`) | Circulación | 483 | 55.5 | 49.1 | 1/18 | 100 | Porcentaje | No |
| 12 | `possession_loss_rate` | Pérdidas por 100 pases (`Pérd/100`) | Circulación | 2145 | 30.7 | 32.6 | 7/18 | 64.7 | Por 100 pases en juego | Sí |
| 13 | `goals_conceded_per_match` | Goles concedidos (`GC/PJ`) | Solidez defensiva | 23 | 1.44 | 1.51 | 7/18 | 61.8 | Por partido | Sí |
| 14 | `shots_conceded_per_match` | Tiros concedidos (`TC/PJ`) | Solidez defensiva | 218 | 13.63 | 14.72 | 5/18 | 76.5 | Por partido | Sí |
| 15 | `clean_sheet_rate` | Porterías a cero (`PC%`) | Solidez defensiva | 4 | 25 | 21.7 | 5/18 | 58.8 | Porcentaje | No |
| 16 | `duel_win_rate` | Duelos ganados (`D%`) | Duelos | 837 | 50.1 | 50 | 8/18 | 58.8 | Porcentaje | No |
| 17 | `aerial_duel_win_rate` | Duelos aéreos ganados (`DA%`) | Duelos | 278 | 55.7 | 50 | 1/18 | 100 | Porcentaje | No |
| 18 | `tackle_success` | Éxito en entradas (`E%`) | Duelos | 67.5 | 67.5 | 64.8 | 3/18 | 88.2 | Porcentaje | No |
| 19 | `possession` | Posesión (`Pos%`) | Estilo | 56 | 56 | 49.9 | 4/18 | 82.4 | Porcentaje | No |
| 20 | `passes_per_match` | Volumen de pase (`P/PJ`) | Estilo | 7384 | 461.5 | 429.2 | 7/18 | 64.7 | Por partido | No |
| 21 | `direct_play_share` | Juego directo (`PL%`) | Estilo | 871 | 11.8 | 12.8 | 11/18 | 41.2 | Proporción de pases | No |
| 22 | `pressing_intensity` | Presión (`PPDA`) | Estilo | 10.1 | 10.1 | 12.8 | 2/18 | 94.1 | **Valor Opta** | Sí |
| 23 | `crosses_per_match` | Frecuencia de centros (`C/PJ`) | Estilo | 199 | 12.4 | 13.4 | 12/18 | 35.3 | Por partido | No |
| 24 | `defensive_actions_per_match` | Actividad defensiva (`AD/PJ`) | Estilo | 437 | 27.3 | 25.6 | 8/18 | 58.8 | Por partido | No |
| 25 | `completed_passes_per_match` | Pases completados (`P+/PJ`) | Circulación | 6147 | 384.2 | 355.8 | 7/18 | 64.7 | Por partido | No |
| 26 | `recoveries_per_match` | Recuperaciones (`REC/PJ`) | Recuperación | 781 | 48.8 | 47.1 | 5/18 | 76.5 | Por partido | No |
| 27 | `interceptions_per_match` | Intercepciones (`INT/PJ`) | Recuperación | 160 | 10 | 9.2 | 5/18 | 76.5 | Por partido | No |
| 28 | `corners_per_match` | Córners (`Cór/PJ`) | Balón parado | 99 | 6.2 | 5.5 | 6/18 | 70.6 | Por partido | No |
| 29 | `fouls_per_match` | Faltas concedidas (`F/PJ`) | Disciplina | 215 | 13.4 | 12 | 16/18 | 11.8 | Por partido | Sí |
| 30 | `yellow_cards_per_match` | Tarjetas amarillas (`A/PJ`) | Disciplina | 29 | 1.81 | 1.86 | 8/18 | 55.9 | Por partido | Sí |
| 31 | `red_cards_per_match` | Tarjetas rojas (`R/PJ`) | Disciplina | 3 | 0.19 | 0.17 | 9/18 | 41.2 | Por partido | Sí |

##### Tabla de los 10 Rasgos de Identidad de Juego (`identity.phases` en `03-team-data-team-profile-payload.json`) (`[OBSERVADO]`)

| Fase del Juego (`phase.key`) | Rasgo (`trait.key`) | Etiqueta (`label`) | Polo Izquierdo (`low_label`) | Polo Derecho (`high_label`) | Invertido (`reversed`) | Unidad | Valor Club América | Media Liga | Ranking | Percentil |
|---|---|---|---|---|---|---|---|---|---|---|
| `positional_attack` | `build_up_patience` | Paciencia en la salida | Vertical | Pausada | `false` | `percentage` | 40.7% | 47.0% | 18/18 | 0.0 |
| `positional_attack` | `box_presence` | Presencia en el área | Menor | Mayor | `false` | `number` | 27.3 | 21.8 | 3/18 | 88.2 |
| `attacking_transition` | `counterattack` | Contragolpe | Esporádico | Frecuente | `false` | `number` | 1.8 | 1.2 | 3/18 | 88.2 |
| `attacking_transition` | `in_behind` | Ataque a la espalda | Menor | Mayor | `false` | `number` | 0.4 | 0.4 | 9/18 | 47.1 |
| `defensive_organisation` | `box_protection` | Protección del área | Permeable | Blindada | `false` | `percentage` | 44.7% | 39.7% | 2/18 | 94.1 |
| `defensive_organisation` | `physicality` | Fisicalidad | Evita el contacto | Física | `false` | `number` | 102.9 | 96.9 | 3/18 | 88.2 |
| `defensive_transition` | `recovery_height` | Altura de recuperación | Campo rival | Campo propio | `true` | `number` | 14.6 | 14.0 | 7/18 | 64.7 |
| `defensive_transition` | `territorial_dominance` | Dominio territorial | Dominado | Dominante | `false` | `percentage` | 58.0% | 49.8% | 4/18 | 82.4 |
| `defensive_transition` | `counter_exposure` | Exposición a la contra | Controlada | Expuesta | `true` | `number` | 1.6 | 1.1 | 4/18 | 82.4 |
| `defensive_transition` | `recovery_balance` | Balance recuperación/pérdida | Pasivo | Reactivo | `false` | `number` | 0.36 | 0.37 | 11/18 | 41.2 |

---

#### B. Serie Histórica Móvil xG vs xGA (`03-team-data-team-xg-rolling-payload.json` · 10.9 KB) (`[OBSERVADO]`)
Generado por `OptaTeamXgTimelineService` y renderizado por `team-xg-rolling.js`. Contiene 54 partidos consecutivos de Liga MX (desde `2025/2026` hasta la Jornada 16 del Apertura `2026/2027`) con ventana móvil de 5 partidos (`window: 5`).

```json
{
  "available": true,
  "window": 5,
  "matches_count": 54,
  "points": [
    {
      "index": 1,
      "date": "2025-07-12",
      "date_label": "12 jul 2025",
      "season": "2025/2026",
      "opponent": "Juárez",
      "venue": "V",
      "score": "1-1",
      "raw_xg": 0.99,
      "raw_xga": 0.91,
      "xg": 0.99,
      "xga": 0.91,
      "diff": 0.08,
      "manager": "André Jardine"
    },
    {
      "index": 54,
      "date": "2026-11-08",
      "date_label": "8 nov 2026",
      "season": "2026/2027",
      "opponent": "Pumas UNAM",
      "venue": "V",
      "score": "2-2",
      "raw_xg": 1.83,
      "raw_xga": 1.57,
      "xg": 2.05,
      "xga": 1.4,
      "diff": 0.65,
      "manager": "Guillermo Almada"
    }
  ],
  "coach_changes": [
    {
      "index": 36,
      "date": "2026-04-19",
      "date_label": "19 abr 2026",
      "from": "André Jardine",
      "to": "Guillermo Almada"
    }
  ],
  "season_starts": [
    { "index": 1, "season": "2025/2026" },
    { "index": 39, "season": "2026/2027" }
  ],
  "month_ticks": [
    { "index": 1, "label": "Jul 25" },
    { "index": 51, "label": "Nov 26" }
  ],
  "summary": {
    "latest_xg": 2.05,
    "latest_xga": 1.4,
    "latest_diff": 0.65,
    "avg_xg": 1.75,
    "avg_xga": 1.29,
    "y_max": 3
  }
}
```

---

#### C. Perfil de Edad de la Plantilla (`03-team-data-team-age-profile-payload.json` · 4.3 KB) (`[OBSERVADO]`)
Consumido por `team-age-profile.js`. Incluye los 36 jugadores registrados en la temporada con su edad exacta decimal/entera, minutos jugados, cuota de minutos (`minutes_share` sobre el total del equipo) y la banda de edad óptima de referencia (`reference: { from: 24, to: 29, label: "Edad pico (24–29)" }`):

```json
{
  "available": true,
  "season": "2026/2027",
  "total_minutes": 15795,
  "average_age": 25.3,
  "weighted_age": 26.8,
  "reference": {
    "from": 24,
    "to": 29,
    "label": "Edad pico (24–29)"
  },
  "players": [
    {
      "id": "54kcu71vtiz8xlkke60k394a1",
      "name": "É. Sánchez",
      "age": 27,
      "minutes": 1113,
      "minutes_share": 70.6,
      "position": "MCD",
      "position_group": "MED"
    },
    {
      "id": "5ysw10inm8syf7r9xvbpk9n11",
      "name": "H. Martín",
      "age": 33,
      "minutes": 1110,
      "minutes_share": 70.4,
      "position": "DC",
      "position_group": "DEL"
    }
  ]
}
```

---

#### D. Perfil de Formación, Red de Pases y Matriz de Pases (`03-team-data-team-formation-profile-payload.json` y `team-pass-network.js`) (`[OBSERVADO]`)

1. **`03-team-data-team-formation-profile-payload.json` (`1.6 KB`, consumido por `team-formation-profile.js`):**
   Contiene la formación más utilizada (`"formation": "4-2-3-1"`, `"formation_share": 87.5`, `"matches": 16`) y los 11 nodos posicionales con coordenadas tácticas $(x, y) \in [0, 100] \times [0, 100]$, el jugador titular más frecuente en cada puesto (`id`, `name`, `shirt`, `starts_in_slot`) y la lista completa de formaciones usadas en el torneo (`usage`).
   ```json
   {
     "available": true,
     "formation": "4-2-3-1",
     "formation_share": 87.5,
     "matches": 16,
     "nodes": [
       { "slot": 1, "role": "POR", "x": 8, "y": 50, "id": "3x90...", "name": "R. Cota", "shirt": 30, "starts": 8 },
       { "slot": 9, "role": "DC", "x": 86, "y": 50, "id": "5ysw10inm8syf7r9xvbpk9n11", "name": "H. Martín", "shirt": 9, "starts": 13 }
     ],
     "usage": [
       { "formation": "4-2-3-1", "matches": 14, "share": 87.5 },
       { "formation": "4-4-2", "matches": 2, "share": 12.5 }
     ]
   }
   ```

2. **Red de Pases (`data-team-pass-network-payload` / `team-pass-network.js`) y Matriz de Pases (`data-team-pass-matrix-table`):** (`[OBSERVADO]` en `team-pass-network.js` líneas 1–420)
   - En la pestaña `Mapas y Gráficas` de equipo (bloqueada tras paywall `Plus` en cuenta gratuita, pero cuyo motor JS completo está cargado en `evidence/javascript/named/team-pass-network.js`), el atributo `data-team-pass-network-payload` entrega el grafo dirigido de pases del equipo:
   ```typescript
   interface TeamPassNetworkPayload {
     available: boolean;
     pitch: { length: 105; width: 68 };
     min_edge_count: number; // Umbral mínimo de pases para dibujar arista (default: 3)
     nodes: Array<{
       id: string;           // UUID Opta del jugador o slot táctico
       name: string;
       shirt: number | string;
       position: string;
       x: number;            // Posición media de pase en [0, 100] Opta
       y: number;            // Posición media de pase en [0, 100] Opta
       passes: number;       // Total de pases originados/involucrados
       xg_chain?: number;
       xt?: number;
       starter?: boolean;
     }>;
     edges: Array<{
       from: string;         // ID nodo origen
       to: string;           // ID nodo destino
       count: number;        // Cantidad de pases completados (from -> to)
       xt?: number;          // Amenaza esperada acumulada en la conexión
     }>;
     pass_matrix?: {
       players: Array<{ id: string; name: string; shirt: number }>;
       cells: Record<string, Record<string, number>>; // cells[from_id][to_id] = count
       row_totals: Record<string, number>;
       col_totals: Record<string, number>;
     };
   }
   ```
   - `team-pass-network.js` renderiza en el SVG de cancha ($105 \times 68$) aristas curvas bezier (`<path data-pass-network-edge>`) cuyo grosor y opacidad escalan con `edge.count / maxEdgeCount` y nodos (`<g data-pass-network-node>`) cuyo radio escala con `node.passes`. Al hacer hover o foco sobre un nodo (`[data-pass-network-node]`), resalta todas sus aristas entrantes/salientes y sincroniza la tabla `data-team-pass-matrix-table`.

3. **Pestañas `Balón parado` (`set-pieces`), `Análisis del rival` (`rival-analysis`) y `AutoReport` (`autoreport`) en `03-team.html`:** (`[OBSERVADO]`)
   - En `03-team.html`, estas tres pestañas existen en la barra de navegación del perfil de equipo, pero su contenido renderiza actualmente un estado *placeholder* oficial: **`Próximamente · v2.0 (2027)`** (al igual que la pestaña `AutoReport` en perfil de jugador y el botón flotante `Chat SK`).

---

### 3.4. Payloads de Jugadores y Búsqueda Avanzada de Scouting (`04-player-data-bootstrap.json` y `07-players.html`) (`[OBSERVADO]`)

- **Evidencia:** `04-player-data-bootstrap.json` (`15.7 KB`, `ev_59e57f74d8e4894a8c290cd1f58354701d398bea6301f1cdfe07edeeef89f945`), `04-player.html`, `07-players.html` (`ev_e97046d53210bf233f1dc576a689f77283053071ff3e34bcc5c159f70a48d467`) y `event-map.js`.

#### A. Bootstrap del Mapa de Eventos de Jugador (`04-player-data-bootstrap.json`)
Hidrata el componente `#player-detail-map` (`event-map.js`). Define los periodos de torneo/temporada del jugador, el mapeo `season_tmcl` de 67 calendarios de torneo Opta, y el árbol de tipos de eventos con sus banderas de acceso por plan (`PlanAccess::allowsMapEvent()`):

```json
{
  "periods": [
    {
      "key": "2hsidwomhjsaaytdy9u5niyi4|2026/2027|e603sojy77s4u0ypqds2v2a1g",
      "competition_id": "2hsidwomhjsaaytdy9u5niyi4",
      "competition_name": "Liga MX",
      "season": "2026/2027",
      "contestant_id": "e603sojy77s4u0ypqds2v2a1g",
      "contestant_name": "Chivas",
      "tournaments": [
        { "key": "apertura", "label": "Apertura" }
      ]
    }
  ],
  "matches": [],
  "default_period": "2hsidwomhjsaaytdy9u5niyi4|2026/2027|e603sojy77s4u0ypqds2v2a1g",
  "default_tournament": "apertura",
  "season_tmcl": {
    "2hsidwomhjsaaytdy9u5niyi4|2026/2027": ["9zum4nxferygj8bb0ldcavxn8"],
    "2hsidwomhjsaaytdy9u5niyi4|2025/2026": ["aegyls91smdw9kipjgbsu8tn8"]
  },
  "locked_events": {
    "shot:xg": true,
    "shot:right_foot": true,
    "shot:left_foot": true,
    "shot:header": true,
    "pass:progressive": true,
    "pass:long": true,
    "pass:forward": true,
    "pass:lateral": true,
    "pass:backward": true,
    "pass:into_box": true,
    "progression:xt_map": true,
    "progression:carries": true,
    "progression:passes": true,
    "creation:assists": true,
    "creation:open_play": true,
    "creation:set_piece": true,
    "creation:crosses": true,
    "creation:through_balls": true,
    "duel:aerial": true,
    "duel:ground": true,
    "duel:tackles": true,
    "dribble:won": true,
    "dribble:lost": true,
    "offball:defensive_recoveries": true,
    "offball:counterpress_recoveries": true,
    "offball:interceptions": true,
    "offball:clearances": true,
    "offball:defensive_territory": true
  }
}
```
> [!NOTE]
> En cuenta gratuita (`Scout`), el evento raíz de cada familia (ej. `involvement:all`, `shot:all`, `pass:all`, `progression:all`, `creation:all`, `duel:all`, `dribble:all`, `offball:all`) está desbloqueado ("Con la cuenta gratuita tienes un evento por sección"), mientras que los 28 sub-filtros específicos (`locked_events`) requieren el plan `Plus`.

#### B. Contrato RPC `loadMapGraphData` (`OptaEventMapBuilder` $\rightarrow$ `event-map.js`) (`[RECONSTRUIDO]` de `event-map.js`)
Cuando `event-map.js` invoca `$wire.loadMapGraphData(filterMode, matchId, periodKey, tournamentKey, eventKey)`, el backend devuelve:
```typescript
interface EventMapGraphDataResponse {
  points: Array<{
    x: number;          // Coordenada X origen Opta [0, 100]
    y: number;          // Coordenada Y origen Opta [0, 100]
    endX?: number;      // Coordenada X destino Opta [0, 100] (pases/conducciones/tiros)
    endY?: number;      // Coordenada Y destino Opta [0, 100]
    outcome?: 0 | 1;    // 1 = exitoso/gol/a puerta, 0 = fallido/bloqueado
    xg?: number;        // Valor xG del tiro (para shot:xg)
    xt?: number;        // Valor xT de la acción (para progression:xt_map)
    minute?: number;
    type?: string;      // "goal" | "saved" | "off_target" | "blocked" | "pass" | "carry"
  }>;
  summary: {            // Generado por OptaEventMapBuilder::summary()
    total: number;
    successful?: number;
    accuracy?: number;
    xg_total?: number;
    xt_total?: number;
  };
  zone_control?: {      // Generado por OptaZoneControl (grilla de 6 zonas: 3 tercios x 2 mitades laterales o 3x3)
    zones: Array<{ zone_id: number; count: number; share: number }>;
  };
}
```

#### C. Búsqueda Avanzada de Scouting (`07-players.html`) (`[OBSERVADO]`)
- **Taxonomía de 14 Posiciones Tácticas (y 20 sub-roles con lateralidad en `04-player.html`):**
  - En `07-players.html` (selector de cancha SVG): `POR` (Portero), `DFC` (Defensa central), `LI` (Lateral izquierdo), `LD` (Lateral derecho), `CAI` (Carrilero izquierdo), `CAD` (Carrilero derecho), `MCD` (Mediocentro defensivo), `MC` (Mediocentro), `MCO` (Mediocentro ofensivo), `VI` (Volante izquierdo), `VD` (Volante derecho), `EI` (Extremo izquierdo), `ED` (Extremo derecho), `DC` (Delantero centro).
  - En `04-player.html` (mapa de apariciones del jugador) se añaden los sub-roles con perfil izquierdo/derecho: `DFCI`, `DFCD`, `MCDI`, `MCDD`, `INI`, `IND` (Interiores), `MCOI`, `MCOD`.
- **Filtros de Rango Dinámico:**
  - Liga (selección múltiple entre las 40 ligas o por país).
  - Periodo: por `Temporada` (`Más reciente`, `2027`, `2026/2027`, `2026`, `2025/2026`, `2025`), por `Fechas` (`Desde` – `Hasta` cruzando torneos), o por `Jornadas` (`Desde Jornada` – `Hasta Jornada`).
  - Edad (`15` a `40+`), Altura (`150 cm` a `210+ cm`), Minutos jugados, Nacionalidad, Club.
  - Hasta **8 métricas simultáneas** (de los 147 traits de jugador + `SKore` cuyo rango en Liga MX 2026/2027 va de **`6.07` a `7.75`**), conmutables entre `p90` y `Total`.
- **Exportación de Tabla (`data-sk-export-table`):** El componente Livewire `Players::exportTable()` serializa las filas filtradas en CSV/imagen (restringido por paywall en cuenta gratuita mediante `data-sk-paywall-downloads`).

---

### 3.5. Payloads de Partidos (`13-match-tabs-*` y `09-match-detail.html`) (`[OBSERVADO]`)

- **Evidencia:** `09-match-detail.html` (`ev_97e91618307b79c26283cb7092099714480742f83252e97a242081625f31cf52`), `13-match-tabs-capture.json` (`ev_1318b6ef36cbf6e763ddae14da0f95b3088da1ea954e8c8993b2994b188569fd`), `13-match-tabs-wait-alineaciones-json-0.json` (`85.3 KB`) y `13-match-tabs-wait-estadisticas-data-momentum-data.json` (`4.6 KB`).
- **Partido auditado:** `9dy7dhz5f13b2ejz2a5tok2l0` — **Pumas UNAM 2 - 2 Club América** (`1,57 xG – 1,83 xG`), Jornada 16 Liga MX Apertura 2026/2027, Sábado 7 de noviembre de 2026, Estadio Olímpico Universitario (asistencia: `40.530`, árbitro: `César Arturo Ramos Palazuelos`).

#### A. Tarjetas de Jugadores del Partido (`13-match-tabs-wait-alineaciones-json-0.json` · `x-ref="cards"`, 85.3 KB) (`[OBSERVADO]`)
Inyectado dentro de `<script type="application/json" x-ref="cards">` en la pestaña `Alineaciones`. Es un diccionario indexado por el **UUID Opta de cada uno de los 42 jugadores convocados** (22 titulares + 9 cambios que ingresaron + 11 suplentes en banca sin minutos):

```typescript
type MatchPlayerCardsMap = Record<string, MatchPlayerCard>; // Clave = Opta Player UUID (25 chars)

interface MatchPlayerCard {
  name: string;           // Ej. "K. Navas", "P. Bennevendo", "Ó. Perea"
  photo: string;          // "https://media.api-sports.io/football/players/{api_football_id}.png"
  team: string;           // "Pumas UNAM" | "Club América"
  crest: string;          // "https://www.statiskicks.com/storage/media/teams/{api_football_id}.png"
  side: "home" | "away";
  country: string;        // Ej. "Costa Rica", "México"
  flag: string;           // "https://flagcdn.com/w20/{iso}.png"
  age: number;
  shirt: number;
  position: string;       // Ej. "Portero", "Lateral izquierdo", "Mediocampista"
  minutes: number;        // Minutos jugados (0 para banca)
  rating: number | null;  // SKORE del partido (ej. 5.97, 7.44; null si no jugó o < umbral de minutos)
  grade: "low" | "mid" | "high" | "na"; // Banda de color de OptaMatchRatingService::grade()
  events: string[];       // Ej. ["Gol", "Asistencia", "Amarilla"]
  played: boolean;
  keeper: boolean;
  groups: Array<{
    label: "Portero" | "Finalización" | "Creación" | "Pase" | "Posesión" | "Defensa" | "Juego aéreo";
    rows: Array<{ label: string; text: string }>;
  }>;
  note: string;           // Texto de fallback si no jugó ("No jugó en este partido.")
  url: string;            // "https://www.statiskicks.com/player/{opta_uuid}/{slug}"
}
```
- **Grupos de estadísticas por rol en `x-ref="cards"` (`[OBSERVADO]`):**
  - **Jugadores de campo (`keeper: false`, 6 grupos, 40 filas):**
    1. `Finalización` (8): `Goles`, `Remates`, `Remates a puerta`, `Ocasiones claras convertidas`, `Ocasiones claras falladas`, `xG en jugada`, `xG en penales`, `xG a puerta (xGOT)`.
    2. `Creación` (7): `Asistencias`, `xA en jugada`, `xA en balón parado`, `Pases clave`, `Pases filtrados`, `Ocasiones claras creadas`, `Centros y córners precisos`.
    3. `Pase` (6): `Pases precisos`, `Pases largos precisos`, `Pases progresivos precisos`, `Pases cortos precisos`, `Pases hacia adelante precisos`, `Pases hacia atrás precisos`.
    4. `Posesión` (9): `Toques`, `Toques en el tercio rival`, `Toques en el área rival`, `Retención`, `Pérdidas de posesión`, `Mal control`, `Conducciones progresivas`, `Regates exitosos`, `Faltas recibidas`.
    5. `Defensa` (6): `Intercepciones`, `Bloqueos`, `Entradas ganadas`, `Rechaces por abajo`, `Rechaces de cabeza`, `Recuperaciones`.
    6. `Juego aéreo` (4): `Duelos aéreos ofensivos ganados`, `Duelos aéreos defensivos ganados`, `Duelos aéreos ganados`, `Remates de cabeza`.
  - **Porteros (`keeper: true`, 3 grupos, 25 filas):**
    1. `Portero` (10): `Atajadas`, `Ocasiones claras atajadas`, `Goles prevenidos`, `Pases progresivos precisos`, `Pases precisos`, `Toques`, `Acciones como líbero`, `Achiques`, `Penaltis atajados`, `Goles recibidos`.
    2. `Pase` (6) y `Posesión` (9) idénticos a jugador de campo.
- **Carga diferida de Mapas Individuales del Partido (`loadPlayerEvents`):**
  Al abrir la pestaña `Alineaciones`, el cliente dispara automáticamente la llamada RPC Livewire `POST /livewire-e3175f40/update` con `"method": "loadPlayerEvents", "params": []` (`13-match-tabs-post-request-104.json`), que hidrata en memoria los puntos de mapa de calor (`player-heat.js`) y de portería (`goalmouth-map.js` / `OptaKeeperGoalmouthService`) para el modal de detalle de cada jugador.

#### B. Serie Minuto a Minuto de Momentum (`13-match-tabs-wait-estadisticas-data-momentum-data.json` · 4.6 KB) (`[OBSERVADO]`)
Inyectado en el atributo `data-momentum-data` (y `<script type="application/json">`) dentro de la pestaña `Estadísticas`, y renderizado por `momentum-chart.js`.
```json
{
  "n": 107,
  "max": 0.0515,
  "points": [
    -0.0124, -0.0117, -0.0083, -0.0026, 0.0006, 0.002, 0.0013, -0.003,
    -0.0079, -0.0132, -0.0166, -0.0145, -0.0092, -0.002, 0.0064, 0.0133
  ],
  "halfIndex": 53,
  "tickStep": 15,
  "goals": [
    {
      "minute": 3,
      "index": 2,
      "team": "away",
      "scorer": "Á. Zendejas",
      "assist": "Ó. Perea",
      "score": "0 - 1",
      "minLabel": "3'",
      "type": "Gol",
      "crest": "https://www.statiskicks.com/storage/media/teams/2287.png"
    },
    {
      "minute": 4,
      "index": 3,
      "team": "home",
      "scorer": "C. Huerta",
      "assist": "U. Antuna",
      "score": "1 - 1",
      "minLabel": "4'",
      "type": "Gol",
      "crest": "https://www.statiskicks.com/storage/media/teams/2286.png"
    },
    {
      "minute": 72,
      "index": 80,
      "team": "away",
      "scorer": "H. Martín",
      "assist": null,
      "score": "1 - 2",
      "minLabel": "72'",
      "type": "Gol de penal",
      "crest": "https://www.statiskicks.com/storage/media/teams/2287.png"
    },
    {
      "minute": 77,
      "index": 85,
      "team": "home",
      "scorer": "R. Morales",
      "assist": null,
      "score": "2 - 2",
      "minLabel": "77'",
      "type": "Gol de penal",
      "crest": "https://www.statiskicks.com/storage/media/teams/2286.png"
    }
  ]
}
```

---

### 3.6. Payloads y Pestañas de Ligas (`14-league-tabs-*` y `06-league.html`) (`[OBSERVADO]`)

- **Evidencia:** `06-league.html` (`ev_bc7ebac834b73578fd1ad9b68b2e5d06774bea085283377a605b1989ed3114af`), `14-league-tabs-capture.json` (`ev_bd430f00f4cc3e0cb3e7d1c12ddd223536657c09ba63ee662b710fb3bdab574a`), `14-league-tabs-wait-maps-data-bootstrap.json` (`10.1 KB`) y `14-league-tabs-post-request-89.json` a `100.json`.

#### A. Pestaña `Proyección` (`14-league-tabs-wait-projection.html`) (`[OBSERVADO]`)
Muestra la tabla proyectada de final de fase regular + probabilidades de postemporada (Liguilla en Liga MX) y la matriz de distribución de probabilidad $P(\text{Posición final} = k)$ para $k \in \{1 \dots 18\}$. En el plan gratuito (`Scout`), los primeros **4 equipos están desbloqueados** y los equipos 5 al 18 aparecen enmascarados como `"Equipo bloqueado"` (`00,0`):

| Pos Actual | Equipo | Pts Actuales | `Pts proy.` (xPts Final) | `Pos. proy.` | `Superlíder` ($P(\text{pos}=1)$) | `Liguilla` | `Campeón` | $P(1.^\circ)$ | $P(2.^\circ)$ | $P(3.^\circ)$ | $P(4.^\circ)$ | $P(5.^\circ)$ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Cruz Azul** | 32 | **33,1** | **1,7** | 44,4 % | 100 % | 21,7 % | 44,4 % | 38,5 % | 17,1 % | — | — |
| 3 | **Guadalajara** | 30 | **31,6** | **2,3** | 29,8 % | 100 % | 25,3 % | 29,8 % | 26,0 % | 31,3 % | 12,9 % | — |
| 2 | **Club América** | 30 | **31,4** | **2,3** | 25,8 % | 100 % | 20,3 % | 25,8 % | 30,6 % | 31,8 % | 11,8 % | — |
| 4 | **Toluca** | 27 | **28,5** | **4,1** | — | 100 % | 22,1 % | — | 4,9 % | 19,8 % | 41,9 % | 24,9 % |
| 5–18 | *Equipo bloqueado (Paywall Plus)* | `00,0` | `00,0` | `00,0` | `00,0` | `00,0` | `00,0` | `0,0` | `0,0` | `0,0` | `0,0` | `0,0` |

#### B. Pestaña `Mapas` de Liga (`14-league-tabs-wait-maps-data-bootstrap.json` + `loadLeagueMap`) (`[OBSERVADO]`)
1. **Payload `data-bootstrap` (`10.1 KB`):** Contiene los 18 equipos de la Liga MX ordenados por su posición en la tabla (`rank: 1..18`, desde `Cruz Azul` hasta `Querétaro`), la estructura de eventos (`involvement`, `shots`, `passes`, `progression`, `creation`, `duels`, `dribbles`, `offball`), vistas (`scatter`, `heatmap`), divisiones (`all`, `thirds`, `zones`), lados (`for` = a favor, `against` = en contra) y la lista `unlocked_teams` con los **8 primeros equipos desbloqueados** en la cuenta gratuita:
   ```json
   {
     "unlocked_teams": [
       "1aw67co8uut64yckd3wbhy9t2",
       "eu8c408f59yx7egaqossbv25e",
       "e603sojy77s4u0ypqds2v2a1g",
       "3390h9hdgoxzzofnrpyktanuz",
       "8jjxbd5vr23vhu1v5r21rzkrn",
       "8yn3l36qkq1fxbw4ufmwyfyt9",
       "2ei66pjfsrr6uxqp1bywq31lo",
       "cynfvfb31rml7xrlsnejf8r6j"
     ],
     "defaults": {
       "option": "involvement",
       "view": "heatmap",
       "division": "all",
       "side": "for",
       "sort": "rank",
       "tournament": "apertura"
     }
   }
   ```
2. **Ráfaga de 8 llamadas RPC Livewire `loadLeagueMap` (`14-league-tabs-post-request-91.json` a `98.json`):**
   Al abrir la pestaña `Mapas`, `league-maps.js` dispara en paralelo 8 peticiones `POST /livewire-e3175f40/update` invocando `LeagueDetail::loadLeagueMap(teamId, option, view, division, tournament, side)` para los 8 clubes desbloqueados, recibiendo el arreglo de coordenadas Opta $[0, 100] \times [0, 100]$ y renderizando en DOM (`14-league-tabs-wait-maps.html`) los volúmenes exactos de involucramiento por partido:
   - `14-league-tabs-post-request-91.json` (`Cruz Azul`): **`16 PJ · 694,8 por partido`** (~11,117 eventos Opta).
   - `14-league-tabs-post-request-92.json` (`Club América`): **`16 PJ · 683,9 por partido`** (~10,942 eventos Opta).
   - `14-league-tabs-post-request-93.json` (`Guadalajara`): **`16 PJ · 775,3 por partido`** (~12,405 eventos Opta).
   - `14-league-tabs-post-request-94.json` (`Toluca`): **`16 PJ · 748,1 por partido`** (~11,970 eventos Opta).
   - `14-league-tabs-post-request-95.json` (`Tigres UANL`): **`16 PJ · 644,9 por partido`** (~10,318 eventos Opta).
   - `14-league-tabs-post-request-96.json` (`Pachuca`): **`16 PJ · 678,8 por partido`** (~10,861 eventos Opta).
   - `14-league-tabs-post-request-97.json` (`Pumas UNAM`): **`16 PJ · 620,7 por partido`** (~9,931 eventos Opta).
   - `14-league-tabs-post-request-98.json` (`Monterrey`): **`16 PJ · 601,6 por partido`** (~9,626 eventos Opta).

#### C. Pestaña `Valoraciones Scout` (`14-league-tabs-wait-scout-ratings.html`) (`[OBSERVADO]`)
Lista el ranking completo de los **402 jugadores registrados con calificación `SKore` en la Liga MX 2026/2027**, filtrable por línea posicional (`Todos`, `POR`, `DEF`, `MED`, `DEL`), grupo de edad (`U23`, `23–28`, `29+`), club (18 clubes) y nacionalidad (21 nacionalidades).
- **Top 10 Liga MX por SKORE (`[OBSERVADO]`):**
  1. `J. Brunetta` (Tigres UANL · 29 años) — **`7.75`**
  2. `B. Rodríguez` (Club América · 26 años) — **`7.74`**
  3. `A. Montaño` (Cruz Azul · 24 años) — **`7.69`**
  4. `F. Viñas` (Toluca · 28 años) — **`7.65`**
  5. `M. Borja` (Club América · 33 años) — **`7.63`**
  6. `S. Rondón` (Pachuca · 37 años) — **`7.57`**
  7. `K. Zenón` (Atlas · 25 años) — **`7.48`**
  8. `S. Aceves` (Toluca · 20 años) — **`7.48`**
  9. `S. Sandoval` (Guadalajara · 19 años) — **`7.44`**
  10. `L. Romo` (Guadalajara · 31 años) — **`7.43`**

---

## 4. Modelos Propios y Motores Estadísticos Derivados en Backend (Value-Add de Statiskicks sobre Opta)

A continuación se documenta cómo calcula, transforma y sirve Statiskicks cada uno de sus 7 motores analíticos propietarios sobre la materia prima de Opta SDAPI.

---

### 4.1. Motor de Calificación Compuesta: **SKORE** (`App\Services\Opta\OptaMatchRatingService`)

- **Clasificación:** `[OBSERVADO]` en `evidence/javascript/named/skore.js` (líneas 1–85), `13-match-tabs-wait-alineaciones-json-0.json` y `14-league-tabs-wait-scout-ratings.html`; `[INFERIDO]` para la agregación estacional.
- **Naturaleza del modelo:**
  - Aunque comercialmente se presenta como el rating propietario **SKORE**, el comentario de cabecera en `skore.js` revela la clase PHP exacta que lo produce: **`App\Services\Opta\OptaMatchRatingService`**.
  - **Escala real observada:** Escala continua de **`0.00` a `10.00`** con 2 decimales (observada en partidos individuales entre `5.36` para P. Bennevendo y `7.44` para Ó. Perea en `13-match-tabs-wait-alineaciones-json-0.json`, y en promedios de temporada de Liga MX entre **`6.07` y `7.75`** con media de liga **`6.77`** en `04-player.html` y `07-players.html`).
- **Clasificación por Bandas (`OptaMatchRatingService::grade()`) y Gradiente Cromático (`skore.js`) (`[OBSERVADO]`):**
  El código fuente de `skore.js` contiene la réplica exacta en cliente de `OptaMatchRatingService::format()` y `OptaMatchRatingService::grade()`:
  $$\text{grade}(r) = \begin{cases} \text{"na"} & \text{si } r = \text{null} \lor \neg\text{isFinite}(r) \\ \text{"low"} & \text{si } r < 6.50 \\ \text{"mid"} & \text{si } 6.50 \le r < 7.00 \\ \text{"high"} & \text{si } r \ge 7.00 \end{cases}$$
  Además, para gráficos de líneas y barras (`skore.js` líneas 38–68), aplica una interpolación lineal RGB por tramos sobre el dominio $[5.80, 7.80]$:
  - $r \le 5.80$: Rojo coral `rgb(232, 93, 74)` (`#E85D4A`)
  - $r = 6.50$: Ámbar `rgb(232, 168, 56)` (`#E8A838`)
  - $r = 7.00$: Verde esmeralda `rgb(76, 175, 125)` (`#4CAF7D`)
  - $r \ge 7.80$: Azul cian `rgb(56, 182, 232)` (`#38B6E8`)

---

### 4.2. Motor de Percentiles Posicionales y de Equipo (`App\Support\RankBands` y `AttributeRanking`)

- **Clasificación:** `[OBSERVADO]` en `percentile-rows.js`, `attribute-charts.js`, `03-team-data-attribute-charts-payload.json` y `04-player.html`; `[RECONSTRUIDO]` para la fórmula exacta de cálculo de percentil.
- **Reglas de Universo y Cohortes Mínimas (`[OBSERVADO]`):**
  1. **Percentiles de Jugador (`OptaSeasonStatsService::buildTraitsData()`):**
     - **Umbral mínimo de minutos:** **`> 270 minutos`** jugados en la competición y periodo seleccionado (declarado explícitamente en `04-player.html`: *"versus semejantes posicionales con más de 270 minutos en el periodo de tiempo o competición seleccionado"*).
     - **Agrupación posicional:** Se compara contra jugadores de **"Posiciones semejantes"** en la misma liga (ej. Luis Romo como `DFCI` se compara contra $N = 76$ defensas con $>270$ min en Liga MX Apertura 2026/2027), con opción en UI (`Filtros de ranking`) de cambiar el universo a `{Misma posición | Todas las posiciones} × {Misma liga | Top ligas}`.
     - **Umbral para Jugadores Similares (Similitud Coseno / Euclidiana de Estilo):** Requiere **`>= 450 minutos`** en el torneo actual; si el jugador no alcanza 450 minutos o su liga tiene pocos jugadores en esa posición, el motor hace *fallback* automático al perfil de la temporada anterior o mide el estilo contra todas las ligas (`04-player.html`).
  2. **Percentiles de Equipo (`OptaTeamAttributeService::forTeam()`):**
     - Universo $N = \text{total de clubes de la competición}$ (ej. $N = 18$ en Liga MX).
- **Fórmula Matemática Exacta de Percentil (`[RECONSTRUIDO]`):**
  Verificada contra las 171 métricas de `03-team-data-attribute-charts-payload.json` y las 31 métricas de `03-team-data-team-profile-payload.json`. Sea $P$ el conjunto de $N$ entidades en la cohorte ($N = 18$ equipos o $N = 76$ jugadores) y sea $v(x)$ el valor de la entidad $x$:
  $$\text{Percentile}(x) = \text{round}\left( \frac{\left|\{ y \in P \setminus \{x\} : y \text{ es estrictamente peor que } x \}\right|}{N - 1} \times 100,\ 2 \right)$$
  donde "$y$ es estrictamente peor que $x$" significa:
  - $v(y) < v(x)$ cuando `lowerIsBetter = false` (ej. en `shots_created`, Club América es `rank = 2` de `18` sin empates $\Rightarrow \frac{18 - 2}{18 - 1} \times 100 = \frac{16}{17} \times 100 = \mathbf{94.12}$).
  - $v(y) > v(x)$ cuando `lowerIsBetter = true` (ej. en `ppda`, Club América tiene `10.10`, `rank = 2` de `18` $\Rightarrow \frac{16}{17} \times 100 = \mathbf{94.12}$).
  - Cuando existen empates en el valor $v(x)$ (por ejemplo, `direct_corner_goals = 0`, donde 15 equipos empatan con $0$ goles olímpicos), ningún equipo tiene menos de $0$, por lo que el numerador es $0$ y el percentil es $\frac{0}{17} \times 100 = \mathbf{0}$.
- **Gradiente Cromático de Barras de Percentil (`App\Support\RankBands::gradient()`, `percentile-rows.js`) (`[OBSERVADO]`):**
  Utiliza 4 puntos de control (`stops = { low: 30, mid_from: 50, mid_to: 60, high: 80 }`):
  - $p \in [0, 30]$: Rojo `#ef4444` $\rightarrow$ Naranja `#f97316`
  - $p \in (30, 50]$: Naranja `#f97316` $\rightarrow$ Amarillo `#eab308`
  - $p \in (50, 60]$: Amarillo `#eab308` $\rightarrow$ Lima `#84cc16`
  - $p \in (60, 80]$: Lima `#84cc16` $\rightarrow$ Verde `#22c55e`
  - $p \in (80, 100]$: Verde `#22c55e` $\rightarrow$ Esmeralda `#10b981`

---

### 4.3. Modelo de Amenaza Esperada: **xT (Expected Threat)**

- **Clasificación:** `[OBSERVADO]` en `03-team.html`, `03-team-data-attribute-charts-payload.json`, `04-player-data-attribute-charts-payload.json` y `13-match-tabs-wait-estadisticas.html`; `[INFERIDO]` para la grilla espacial de transición.
- **Declaración explícita en UI (`03-team.html`):**
  > *"El xT se calcula con un modelo público de amenaza esperada sobre los pases de Opta."*
- **Desglose de Métricas xT Calculadas en Backend (`[OBSERVADO]`):**
  - En Equipos (`03-team-data-attribute-charts-payload.json`): `expected_threat` (`xT (amenaza esperada)`, `val: 0.85` por partido para Club América, media de liga `0.86`).
  - En Jugadores (`04-player-data-attribute-charts-payload.json`, categoría `Progresión`):
    1. `expected_threat` (`xT (amenaza esperada)` total p90: `0.28` para Luis Romo, #1 de 76 en Liga MX).
    2. `expected_threat_passes` (`xT por pases` p90: `0.26`, #1 de 76).
    3. `expected_threat_carries` (`xT por conducciones` p90: `0.02`, #11 de 76).
- **Mecánica de Cálculo (`[INFERIDO]`):**
  El backend proyecta las coordenadas de inicio $(x_1, y_1) \in [0, 100]^2$ y fin $(x_2, y_2) \in [0, 100]^2$ de cada pase completado en juego abierto (y de cada conducción progresiva inferida entre recepciones y acciones subsecuentes del mismo jugador) sobre la matriz pública de valor posicional de Karun Singh ($16 \times 12$ celdas):
  $$\Delta \text{xT}(e) = \max\big(0,\ V(x_2, y_2) - V(x_1, y_1)\big) \quad \text{ó} \quad V(x_2, y_2) - V(x_1, y_1)$$

---

### 4.4. Serie Móvil de 5 Partidos: **xG / xGA Rolling** (`App\Services\Opta\OptaTeamXgTimelineService`)

- **Clasificación:** `[OBSERVADO]` en `03-team-data-team-xg-rolling-payload.json` y `team-xg-rolling.js`; `[RECONSTRUIDO]` con verificación numérica exacta.
- **Fórmula Matemática Exacta (`[RECONSTRUIDO]`):**
  Para cada partido de liga $t \in \{1 \dots M\}$ ordenado cronológicamente (cruzando temporadas, ej. $M = 54$ partidos desde `2025/2026` hasta `2026/2027`), con ventana $W = 5$:
  $$\text{xG}_{\text{rolling}}(t) = \text{round}\left( \frac{1}{\min(t, 5)} \sum_{k=\max(1, t-4)}^{t} \text{raw\_xg}(k),\ 2 \right)$$
  $$\text{xGA}_{\text{rolling}}(t) = \text{round}\left( \frac{1}{\min(t, 5)} \sum_{k=\max(1, t-4)}^{t} \text{raw\_xga}(k),\ 2 \right)$$
  $$\text{diff}(t) = \text{round}\big(\text{xG}_{\text{rolling}}(t) - \text{xGA}_{\text{rolling}}(t),\ 2\big)$$
  - **Verificación numérica en `03-team-data-team-xg-rolling-payload.json` (partidos $t = 50 \dots 54$ de Club América):**
    - $\text{raw\_xg}[50..54] = [2.13, 1.56, 2.71, 2.00, 1.83] \Rightarrow \frac{2.13 + 1.56 + 2.71 + 2.00 + 1.83}{5} = \frac{10.23}{5} = \mathbf{2.046 \approx 2.05}$ (`latest_xg: 2.05`).
    - $\text{raw\_xga}[50..54] = [1.56, 0.51, 1.53, 1.87, 1.57] \Rightarrow \frac{1.56 + 0.51 + 1.53 + 1.87 + 1.57}{5} = \frac{7.04}{5} = \mathbf{1.408 \approx 1.40}$ (`latest_xga: 1.4`).
- **Anotaciones Estructurales (`coach_changes` y `season_starts`) (`[OBSERVADO]`):**
  El servicio detecta cambios en el campo `manager` de Opta entre el partido $t-1$ y $t$, inyectando marcadores verticales punteados (`coach_changes`: ej. índice 36, `"from": "André Jardine", "to": "Guillermo Almada"`), mientras `team-xg-rolling.js` colorea en verde esmeralda las áreas donde $\text{xG}_{\text{rolling}}(t) > \text{xGA}_{\text{rolling}}(t)$ y en rojo coral donde $\text{xG}_{\text{rolling}}(t) < \text{xGA}_{\text{rolling}}(t)$.

---

### 4.5. Motor de Momentum Minuto a Minuto (`xT creado por minuto`)

- **Clasificación:** `[OBSERVADO]` en `13-match-tabs-wait-estadisticas.html`, `13-match-tabs-wait-estadisticas-data-momentum-data.json` y `momentum-chart.js`; `[RECONSTRUIDO]` para el suavizado de la serie.
- **Definición Revelada en la UI (`13-match-tabs-wait-estadisticas.html`):**
  El encabezado del componente en la pestaña `Estadísticas` del partido declara explícitamente qué mide el Momentum de Statiskicks:
  > **`Momentum · xT creado por minuto`**
- **Estructura y Cálculo (`[RECONSTRUIDO]`):**
  1. Para cada minuto de juego $m \in \{1 \dots n\}$ (incluyendo tiempo añadido del 1T y 2T, de modo que $n = 107$ muestras en el Pumas 2–2 América, con `halfIndex = 53` marcando el descanso), el backend suma el $\text{xT}$ generado por el equipo local menos el $\text{xT}$ generado por el equipo visitante en ese minuto:
     $$\text{raw\_momentum}(m) = \sum_{e \in E_{\text{home}}(m)} \Delta\text{xT}(e) - \sum_{e \in E_{\text{away}}(m)} \Delta\text{xT}(e)$$
  2. La serie `points` de longitud $n = 107$ (`max: 0.0515`) presenta transiciones suaves entre minutos adyacentes (ej. `[-0.0124, -0.0117, -0.0083, -0.0026, 0.0006, 0.002]`), lo que demuestra la aplicación de un **filtro gaussiano o media móvil ponderada centrada** ($\sigma \approx 1.5\text{–}2.0$ minutos) en backend antes de serializar `points`.
  3. En el frontend, `momentum-chart.js` ofrece dos vistas conmutables (`data-momentum-view="curve" | "bars"`), zoom interactivo con rueda/botones (`data-momentum-zoom`) y marcadores de goles (`goals[]`) con escudo y minuto exacto.

---

### 4.6. Mapas de Calor KDE, Zonas de Control (`OptaZoneControl`), Clusters K-Means y Portería (`OptaKeeperGoalmouthService`)

- **Clasificación:** `[OBSERVADO]` en `heatmap.js`, `player-heat.js`, `event-map.js`, `league-maps.js` y `goalmouth-map.js`.
1. **Kernel Density Estimation (KDE) en Canvas (`heatmap.js` y `player-heat.js`) (`[OBSERVADO]`):**
   - `heatmap.js` discretiza la cancha de $105 \times 68$ en una malla y evalúa un kernel gaussiano bidimensional con ancho de banda adaptativo según el número de eventos $N$ (`sigma = N < 15 ? 7.5 : N < 50 ? 6.0 : 4.8`), aplicando un umbral de corte inferior (`cutoff = 0.08`) y una rampa cromática de 5 paradas configurada por variables CSS (`--heat-1` a `--heat-5`).
2. **Clustering de Pases (`Número de clusters: 2 | 3 | 6` en `04-player.html` y `event-map.js`) (`[OBSERVADO]`):**
   - En la vista de mapas de jugador (`event-map.js`), cuando el usuario activa la agrupación de pases (`k = 2, 3, 6`) y el filtro `"Filtrar pases poco comunes"`, el motor agrupa los vectores de pase $(x_1, y_1, x_2, y_2) \in [0, 100]^4$ mediante K-means sobre los vectores 4D de origen-destino, renderizando las flechas representantes (centroides) de los $k$ clusters dominantes.
3. **Zonas de Control (`OptaZoneControl`) (`[OBSERVADO]`):**
   - En **Partidos (`13-match-tabs-wait-estadisticas.html`):** Divide el campo en una **grilla de $6 \times 4 = 24$ zonas** y calcula el porcentaje de toques de cada equipo en cada celda (`% de toques por zona`), coloreando la celda con el color del equipo que supera el $55\%$ de dominio territorial.
   - En **Jugadores y Ligas (`event-map.js`, `league-maps.js`):** Permite dividir la cancha en **Tercios** ($3$ zonas longitudinales) o **Zonas** ($3 \times 3 = 9$ o $6$ zonas tácticas).
4. **Mapa de Portería (`OptaKeeperGoalmouthService` / `goalmouth-map.js`) (`[OBSERVADO]`):**
   - Proyecta los tiros a puerta recibidos por el arquero usando las coordenadas Opta `goalmouthY` $\in [44.2, 55.8]$ (poste derecho a poste izquierdo) y `goalmouthZ` $\in [0, 38.0]$ (césped a travesaño) en 3 vistas: `Mapa de calor` (`heat`: filtrable por `Atajadas`, `Goles`, `Ambos`), `Tiros` (`shots`: círculos escalados por `xGOT`) y `Zonas` (`zones`: grilla de $3 \times 2 = 6$ cuadrantes de la portería con porcentaje de atajadas por zona).

---

### 4.7. Motor de Proyecciones de Liga (Monte Carlo / xPts) y Probabilidades Pre-Partido

- **Clasificación:** `[OBSERVADO]` en `03-team.html` (pestaña `Resultados`) y `14-league-tabs-wait-projection.html`; `[INFERIDO]` para el simulador estocástico de calendario restante.
1. **Probabilidades 1X2 Pre-Partido (`Antes del partido (%)` en `03-team.html`) (`[OBSERVADO]`):**
   - En el historial de partidos de `03-team.html`, cada encuentro muestra la terna de probabilidades $(P_{\text{local}}, P_{\text{empate}}, P_{\text{visita}})$ calculada antes del pitido inicial (ej. Pumas UNAM vs Club América J16: **`31% / 26% / 43%`**; Club América vs Toluca J15: **`41% / 26% / 33%`**; Club América vs Pachuca J14: **`62% / 20% / 19%`**).
   - La nota explicativa en UI documenta la regla de *no-leakage* temporal del modelo:
     > *"La barra es la probabilidad que daba el modelo antes del partido, solo con los partidos anteriores; el resultado que se dio va marcado."*
2. **Simulación Monte Carlo del Torneo y Liguilla (`14-league-tabs-wait-projection.html`) (`[OBSERVADO]` / `[INFERIDO]`):**
   - A partir de las probabilidades 1X2 de los partidos restantes del calendario (en J16 de Liga MX resta 1 jornada regular + la llave de Liguilla), el backend ejecuta miles de simulaciones Monte Carlo del cierre del torneo para producir:
     - **`Pts proy.`:** Esperanza matemática de puntos al cierre de la fase regular ($\text{Pts}_{\text{actuales}} + \sum_{m \in \text{restantes}} (3 P_W(m) + 1 P_D(m))$). Por ejemplo, para Cruz Azul (32 pts con 1 partido restante): `Pts proy. = 33,1`.
     - **`Pos. proy.`:** Esperanza matemática de la posición final ($\sum_{k=1}^{18} k \cdot P(\text{pos} = k)$). Verificación numérica exacta sobre la fila de **Cruz Azul** en `14-league-tabs-wait-projection.html`:
       $$E[\text{Pos}] = 1 \times 0.444 + 2 \times 0.385 + 3 \times 0.171 = 0.444 + 0.770 + 0.513 = \mathbf{1.727 \approx 1.7}$$
       Verificación numérica exacta sobre la fila de **Club América**:
       $$E[\text{Pos}] = 1 \times 0.258 + 2 \times 0.306 + 3 \times 0.318 + 4 \times 0.118 = 0.258 + 0.612 + 0.954 + 0.472 = \mathbf{2.296 \approx 2.3}$$
     - **Probabilidades de Hitos (`Superlíder`, `Liguilla`, `Campeón`) y Matriz $18 \times 18$ de Posiciones Finales:** Calculadas contabilizando la fracción de simulaciones Monte Carlo en que cada club termina en la posición $k \in \{1 \dots 18\}$ o gana la serie eliminatoria de Liguilla.
