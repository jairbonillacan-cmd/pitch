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
| 15 | [03b-team-full.html](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/03b-team-full.html) / [03b-team-full-request-46-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/03b-team-full-request-46-response.json) | `ev_8b664e194ac67d05a98289a150adcb3f310fb2622bcc70a084ab5c7d978cb365` | `/team/club-america-eu8c408f59yx7egaqossbv25e` (RPC `loadTeamFormationProfile` · `111,086 B`) |
| 16 | [04b-messi-full.html](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/04b-messi-full.html) / [04b-messi-full-request-45-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/04b-messi-full-request-45-response.json) y [request-47](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/04b-messi-full-request-47-response.json) | `ev_bba17f5b8205d109afaa59748445fa3e6b8b763f44c88cfbb1a22847a3d405b9` | `/player/c5ryhn04g9goikd0blmh83aol/lionel-messi` (MLS `2026`, `AMW`, SKORE `8.29`, rank `1/69` y `1/670`) |
| 17 | [19-players-explorer-and-teams-tab-capture.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/19-players-explorer-and-teams-tab-capture.json) / [19b-players-teams-tab-wait-apply-teams.html](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/19b-players-teams-tab-wait-apply-teams.html) | `ev_ee1b824445ea515e9b3e77beab6b26944bada18d1da9672c4e24e67a44959dfc` / `ev_6b549dd49e412ea51ee2493cc932cd8e19fdd6c66225d9b2e9486215bf236a16` | `/players` modo `Equipos` (RPC `setTab('teams')`, `applyTeamFilters`, `statRanges`) |
| 18 | [24-players-search-and-oauth-capture.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/24-players-search-and-oauth-capture.json) / [request-16](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/24-players-search-and-oauth-request-16-response.json) y [request-17](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/24-players-search-and-oauth-request-17-response.json) | `ev_335de9032833d29fc76238a8c934e4cf676b276ceba699de0417f730b7bc9f66` | `GET /players/search?q={messi,malagon}` (`3,577 B` / `806 B`) y flujo Google OAuth |
| 19 | [26-player-rpc-full-capture.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/26-player-rpc-full-capture.json) / `26-player-rpc-full-request-{44,46,52,62,63,64,65,66}-response.json` | `ev_41b5aea353de3d177450dcde63cb0d0667428ca0f57851df7edfd18049e9319c` | `/player/1cyhpfi77dom7gmpuownxlcrt/luis-romo` (`loadSimilarPlayersData`, `ensureComparisonDataLoaded`, `loadMapGraphFilterOptions`, `loadMapGraphData`) |
| 20 | [27-goalkeeper-rpc-capture.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/27-goalkeeper-rpc-capture.json) / [request-44](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/27-goalkeeper-rpc-request-44-response.json), [request-46](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/27-goalkeeper-rpc-request-46-response.json) y [request-52](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/27-goalkeeper-rpc-request-52-response.json) | `ev_fe42082ccfb04731fd689598d84d1596a35361d94ca19ba7707e87a1c1fc8ab0` | `/player/a1qs3b34p5u2s6mmlhdkgdp7t/luis-malagon` (Perfil de Portero `GK`, 176 traits, `goalmouth`, `loadSimilarPlayersData`) |
| 21 | [28-match-alineaciones-rpc-full-capture.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/28-match-alineaciones-rpc-full-capture.json) / [request-69](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/28-match-alineaciones-rpc-full-request-69-response.json) y [request-105](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/28-match-alineaciones-rpc-full-request-105-response.json) | `ev_74a52e02fbfe3463262bfdc3648bc82b62958c735f8153d56f6c56cf21ab706d` | `/partido/pumas-unam-vs-club-america-9dy7dhz5f13b2ejz2a5tok2l0` (`setTab(['alineaciones'])` + `keeperGoalmouth(['9sme7jykdv8msgfu0nxx6h39x'])`) |
| 22 | [29-league-tabs-and-team-subtabs-capture.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/29-league-tabs-and-team-subtabs-capture.json) / [rosetta-40-leagues-opta-apifootball.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/rosetta-40-leagues-opta-apifootball.json) | `ev_a1d8facdf931a87bf33ba5e703e23d73cd2ee0c4550557ba3b84cdb9a1c10088` | `/leagues`, `/league/{locked_opta_id}`, `/team/club-america-eu8c408f59yx7egaqossbv25e` (Matriz Rosetta 40 ligas y paywall en servidor) |
| 23 | [30-player-tabs-compare-desempeno-modals-capture.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/30-player-tabs-compare-desempeno-modals-capture.json) / [request-62-request.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/30-player-tabs-compare-desempeno-modals-request-62-request.json) y [request-63-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/30-player-tabs-compare-desempeno-modals-request-63-response.json) | `ev_9435086f6ae02ff0707fefa83c7cf473eda660deed890524e621cb9825c97446` | `/player/c5ryhn04g9goikd0blmh83aol/lionel-messi` (RPC `ensureComparisonDataLoaded([])` + REST `GET /players/search?q=Luis` con 20 resultados multi-liga) |
| 24 | [31-players-statranges-and-matches-hub-capture.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/31-players-statranges-and-matches-hub-capture.json) / [request-40](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/31-players-statranges-and-matches-hub-request-40-response.json) y [request-42](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/31-players-statranges-and-matches-hub-request-42-response.json) | `ev_04b1ede55ec1bd3f547cd81c48dc5a1fc2e4e8b8f9a9020481a3e35092a126e8` | `/players` y `/matches` (RPC `statRanges`, `periodCalendar`, [07-players-wire-script-0.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/inline-pages/07-players-wire-script-0.js) y [rosetta-177-opta-attributes-catalog.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/rosetta-177-opta-attributes-catalog.json)) |
| 25 | [32-match-detail-tabs-and-player-modal-capture.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/32-match-detail-tabs-and-player-modal-capture.json) / [match-1535061-all-player-cards.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/match-1535061-all-player-cards.json) y [match-1535061-momentum-107pts.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/match-1535061-momentum-107pts.json) | `ev_6f32762bb5eaa2f8561fb62de9190b30fe0080d805e0bb03ad3377847062ea5f` | `/partido/pumas-unam-vs-club-america-9dy7dhz5f13b2ejz2a5tok2l0` (Pestañas de partido, 42 tarjetas `x-ref="cards"` y serie Momentum `n=107`) |

---

## 1. Veredicto Forense sobre el Origen de los Datos (`Data Provenance`): La "Piedra Rosetta" de Tres Proveedores y Resolución Formal de `unk_c7104fcac7a6781cc23c6d1216a43d4cc6e1e384c408bca299be9c4270d61191` (`truthVerified: true`)

La arquitectura de datos de Statiskicks opera sobre una **"Piedra Rosetta" de tres proveedores externos de datos y media deportiva** reconciliados en el backend Laravel (con resolución formal verificada en [evidence/rea-unknowns.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/rea-unknowns.json) para `unk_c7104fcac7a6781cc23c6d1216a43d4cc6e1e384c408bca299be9c4270d61191`, `status: "resolved"`, `disposition: "verified"`, `truthVerified: true`):

1. **Proveedor 1 (Primario — Claves Primarias, Estadísticas, Calendarios, Plantillas y Eventos On-Ball) (`[OBSERVADO]`):** **Stats Perform / Opta Sports Data API (SDAPI)**. Todas las claves primarias en URLs y componentes Livewire (`leagueId`, `teamId`, `playerId`, `fixtureId`, `seasonId`, `stageId`) son **UUIDs alfanuméricos de 25 caracteres en base-36 (`[0-9a-z]{25}`)** de Opta SDAPI.
2. **Proveedor 2 (Secundario — Logos de Ligas, Escudos de Clubes y Fotografías Primarias de Jugadores) (`[OBSERVADO]`):** **API-Football (`v3.football.api-sports.io` / `media.api-sports.io`)**. Sus IDs enteros canónicos indexan los 40 logos de competiciones (`/storage/media/leagues/{api_football_league_id}.png`), todos los escudos de clubes (`/storage/media/teams/{api_football_team_id}.png`) y las fotografías primarias de jugadores (`https://media.api-sports.io/football/players/{api_football_player_id}.png`).
3. **Proveedor 3 (Terciario — Avatares Secundarios / Fallback de Jugadores y Banderas) (`[OBSERVADO]`):** **FotMob CDN (`https://images.fotmob.com/image_resources/playerimages/{fotmob_id}.png`)** para fotografías secundarias/fallback de jugadores (ej. `1069546` Rodrigo Dourado, `690073` Cristian Borja, `609892` Sebastián Cáceres), complementado por **FlagCDN (`https://flagcdn.com/w20/{iso}.png` y `w40`)** para banderas nacionales ISO 3166-1 alpha-2.

---

### 1.1. Pruebas Irrefutables del Proveedor 1 (Primario): Stats Perform / Opta SDAPI

#### A. Declaración Legal Explícita, Comentarios de Desarrollador y Comandos Artisan (`[OBSERVADO]`)
1. **Declaración legal en el DOM (`01-home.html` a `32-match-detail-tabs-and-player-modal-capture.json`):**
   - **Footer global:** `© 2026 Statiskicks. Todos los derechos reservados. Términos y Condiciones de uso · Aviso de privacidad integral · Datos de fútbol: Opta (Stats Perform).`
   - **Subtítulo del Radar de Equipo:** `El xT se calcula con un modelo público de amenaza esperada sobre los pases de Opta.` ([03-team.html](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/03-team.html), `ev_aa5f2d74196b21062c132e8b6ec8934f023380f93c40f78f99e333a43bfc9977`).
   - **Subtítulo de la Serie Histórica xG Rolling:** `54 partidos con xG · Fuente: Opta` ([03-team.html](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/03-team.html)).
   - **Etiqueta de Normalización en Payload JSON:** En [team-america-profile-percentiles.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/team-america-profile-percentiles.json), la métrica `pressing_intensity` (`PPDA`) lleva el atributo explícito `"normalization_label": "Valor Opta"`.
2. **Comentarios internos de desarrollador en [07-players-wire-script-0.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/inline-pages/07-players-wire-script-0.js#L310-L388) (`ev_04b1ede55ec1bd3f547cd81c48dc5a1fc2e4e8b8f9a9020481a3e35092a126e8`):**
   El script inline de Livewire `wire:effects.scripts` extraído de `/players` confirma tanto el comando Artisan de cobertura Opta en el backend como el uso directo de los nombres de país de Opta SDAPI:
   - [Líneas 310–312](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/inline-pages/07-players-wire-script-0.js#L310-L312): `// False until php artisan opta:coverage has run, and on the team tab: the picker then hides the "Sin datos" marker instead of guessing.`
   - [Líneas 386–387](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/inline-pages/07-players-wire-script-0.js#L386-L387): `// Accent-insensitive, on the league, its country in Spanish or as Opta names it, and the region: "mexico" finds México, "espana" España.`

#### B. Filtración de Nombres de Clases PHP del Backend Laravel (`App\Services\Opta\*`) (`[OBSERVADO]`)
Los módulos JavaScript servidos sin minificar desde `/custom_assets/js/named/*.js` contienen comentarios de documentación interna que revelan la arquitectura exacta del backend Laravel y el namespace `App\Services\Opta\`:

| Archivo JS Frontend (`evidence/javascript/named/`) | Clase / Método Backend PHP Filtrado en Comentarios | Propósito del Servicio en Backend |
|---|---|---|
| [skore.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/skore.js) (líneas 5–7) | `App\Services\Opta\OptaMatchRatingService::format()` y `::grade()` | Cálculo, formateo y clasificación por bandas (`low`, `mid`, `high`) del rating **SKORE**. |
| [attribute-charts.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/attribute-charts.js) (línea 6) | `OptaSeasonStatsService::buildTraitsData()` | Construcción del catálogo de 147 atributos/traits (jugador de campo) y 176 (portero) por 90 min y totales. |
| [attribute-charts.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/attribute-charts.js) (línea 7) | `OptaTeamAttributeService::forTeam()` | Construcción del catálogo de 171 atributos/traits por partido y totales para equipos. |
| [team-xg-rolling.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/team-xg-rolling.js) (línea 4) | `OptaTeamXgTimelineService` | Serie histórica móvil de 5 partidos (`window: 5`) de `xG`, `xGA` y cambios de DT. |
| [goalmouth-map.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/goalmouth-map.js) (línea 4) | `OptaKeeperGoalmouthService` | Mapa de portería (`goalmouthY` $\in [44.2, 55.8]$, `goalmouthZ` $\in [0, 38]$) para arqueros. |
| [event-map.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/event-map.js) (línea 277) | `OptaZoneControl` | Grilla táctica de control territorial por zonas (6 zonas en jugador, 24 zonas en partido). |
| [event-map.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/event-map.js) (línea 1743) | `OptaEventMapBuilder::summary()` | Agregación de eventos espaciales $(x, y)$, clusters K-means de pases y mapas de calor. |
| [percentile-rows.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/percentile-rows.js) (línea 5) | `App\Support\RankBands::gradient()` | Gradientes cromáticos semafóricos para barras de percentiles (`0–100`). |
| [team-profile.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/team-profile.js) (línea 4) | `App\Support\RankBands::third()` | Clasificación por tercios (`low`, `mid`, `high`) en el perfil táctico de equipo. |
| [attribute-charts.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/attribute-charts.js) (línea 1178) | `AttributeRanking::view()` | Renderizado de tablas de ranking posicional y de equipo. |
| [event-map.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/event-map.js) (línea 522) | `PlanAccess::allowsMapEvent()` | Control de paywall por tipo de evento en mapas (`involvement`, `shot:*`, `pass:*`). |
| [07-players-wire-script-0.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/inline-pages/07-players-wire-script-0.js) (líneas 31, 133, 301, 438, 477) | `Players::formatStatValue()`, `Players::defaultCompetitionId()`, `Players::selectedSeasons()`, `Players::periodCalendar()`, `MatchWindow::label()` | Formateo unificado de métricas en `/players`, resolución de temporada activa por liga y calendario de jornadas/fechas. |

#### C. Identificadores Universales Alfanuméricos de 25 Caracteres en Base-36 (Opta SDAPI UUIDs) (`[OBSERVADO]`)
Toda entidad de dominio en las URLs, atributos `wire:key`, snapshots Livewire (`leagueId`, `teamId`, `playerId`, `fixtureId`, `seasonId`, `stageId`) y payloads JSON de Statiskicks utiliza como clave primaria el **UUID alfanumérico de 25 caracteres en base-36 (`[0-9a-z]{25}`, ocasionalmente 24 cuando el dígito inicial es cero omitido)** propio de **Stats Perform / Opta Sports Data API (SDAPI)**:

| Tipo de Entidad Opta SDAPI | Campo en Statiskicks | Ejemplo Real Capturado | Entidad Representada | Evidencia Fuente |
|---|---|---|---|---|
| **Competición (`competition`)** | `leagueId` / `competition_id` | `2hsidwomhjsaaytdy9u5niyi4` | **Liga MX** (México) | [rosetta-40-leagues-opta-apifootball.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/rosetta-40-leagues-opta-apifootball.json) |
| **Competición (`competition`)** | `leagueId` / `competition_id` | `2kwbbcootiqqgmrzs6o5inle5` | **Premier League** (Inglaterra) | [rosetta-40-leagues-opta-apifootball.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/rosetta-40-leagues-opta-apifootball.json) |
| **Competición (`competition`)** | `leagueId` / `competition_id` | `34pl8szyvrbwcmfkuocjm3r6t` | **Primera División / LaLiga** (España) | [rosetta-40-leagues-opta-apifootball.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/rosetta-40-leagues-opta-apifootball.json) |
| **Competición (`competition`)** | `leagueId` / `competition_id` | `6by3h89i2eykc341oz7lv1ddd` | **Bundesliga** (Alemania) | [rosetta-40-leagues-opta-apifootball.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/rosetta-40-leagues-opta-apifootball.json) |
| **Competición (`competition`)** | `leagueId` / `competition_id` | `1r097lpxe0xn03ihb7wi98kao` | **Serie A** (Italia) | [rosetta-40-leagues-opta-apifootball.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/rosetta-40-leagues-opta-apifootball.json) |
| **Competición (`competition`)** | `leagueId` / `competition_id` | `dm5ka0os1e3dxcp3vh05kmp33` | **Ligue 1** (Francia) | [rosetta-40-leagues-opta-apifootball.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/rosetta-40-leagues-opta-apifootball.json) |
| **Competición (`competition`)** | `leagueId` / `competition_id` | `287tckirbfj9nb8ar2k9r60vn` | **MLS** (Estados Unidos) | [rosetta-40-leagues-opta-apifootball.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/rosetta-40-leagues-opta-apifootball.json) |
| **Competición (`competition`)** | `leagueId` / `competition_id` | `581t4mywybx21wcpmpykhyzr3` | **Liga Profesional Argentina** | [rosetta-40-leagues-opta-apifootball.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/rosetta-40-leagues-opta-apifootball.json) |
| **Competición (`competition`)** | `leagueId` / `competition_id` | `scf9p4y91yjvqvg5jndxzhxj` | **Serie A / Brasileirão** (Brasil) | [rosetta-40-leagues-opta-apifootball.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/rosetta-40-leagues-opta-apifootball.json) |
| **Temporada (`tournamentCalendar`)** | `seasonId` / `season_tmcl` | `9zum4nxferygj8bb0ldcavxn8` | **Liga MX 2026/2027** | [04-player-data-bootstrap.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/04-player-data-bootstrap.json) |
| **Temporada (`tournamentCalendar`)** | `seasonId` / `season_tmcl` | `aegyls91smdw9kipjgbsu8tn8` | **Liga MX 2025/2026** | [04-player-data-bootstrap.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/04-player-data-bootstrap.json) |
| **Temporada (`tournamentCalendar`)** | `selectedSeasonId` / `season_tmcl` | `6i6n0jkbh9zzij6s8htfjh2j8` | **MLS 2026** | [30-player-tabs-compare-desempeno-modals-request-62-request.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/30-player-tabs-compare-desempeno-modals-request-62-request.json) |
| **Fase / Etapa (`stage`)** | `stageId` / `tournament_key` | `74623a6zmmk15vosebdok4kr8` | **MLS 2026 Regular Season** (`STAGE_74623a6zmmk15vosebdok4kr8`) | [30-player-tabs-compare-desempeno-modals-request-62-request.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/30-player-tabs-compare-desempeno-modals-request-62-request.json) |
| **Club (`contestant`)** | `teamId` / `/team/{uuid}/{slug}` | `eu8c408f59yx7egaqossbv25e` | **Club América** (México) | [rosetta-teams-opta-apifootball.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/rosetta-teams-opta-apifootball.json) |
| **Club (`contestant`)** | `teamId` / `/team/{uuid}/{slug}` | `ayabrorjqa1bj7jk1fdqu1t57` | **Pumas UNAM** (México) | [rosetta-teams-opta-apifootball.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/rosetta-teams-opta-apifootball.json) |
| **Club (`contestant`)** | `teamId` / `/team/{uuid}/{slug}` | `7a7uyvix8axi28h7d3bwl4tbe` | **Inter Miami** (EE. UU.) | [rosetta-teams-opta-apifootball.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/rosetta-teams-opta-apifootball.json) |
| **Club (`contestant`)** | `teamId` / `contestant_id` | `e603sojy77s4u0ypqds2v2a1g` | **Guadalajara / Chivas** (México) | [rosetta-teams-opta-apifootball.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/rosetta-teams-opta-apifootball.json) |
| **Club (`contestant`)** | `teamId` / `teams[].id` | `1aw67co8uut64yckd3wbhy9t2` | **Cruz Azul** (México) | [rosetta-teams-opta-apifootball.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/rosetta-teams-opta-apifootball.json) |
| **Jugador (`person` / `player`)** | `playerId` / `/player/{uuid}/{slug}` | `c5ryhn04g9goikd0blmh83aol` | **Lionel Messi** (Inter Miami) | [30-player-tabs-compare-desempeno-modals-request-62-request.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/30-player-tabs-compare-desempeno-modals-request-62-request.json) |
| **Jugador (`person` / `player`)** | `playerId` / `/player/{uuid}/{slug}` | `1cyhpfi77dom7gmpuownxlcrt` | **Luis Romo** (Guadalajara) | [04-player.html](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/04-player.html) |
| **Jugador (`person` / `player`)** | `playerId` / `/player/{uuid}/{slug}` | `a1qs3b34p5u2s6mmlhdkgdp7t` | **Luis Ángel Malagón** (Club América) | [27-goalkeeper-rpc-request-44-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/27-goalkeeper-rpc-request-44-response.json) |
| **Jugador (`person` / `player`)** | `cards[uuid]` | `9sme7jykdv8msgfu0nxx6h39x` | **Keylor Navas** (Pumas UNAM) | [match-1535061-all-player-cards.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/match-1535061-all-player-cards.json) |
| **Jugador (`person` / `player`)** | `players[].id` | `54kcu71vtiz8xlkke60k394a1` | **Érick Sánchez** (Club América) | [team-america-age-profile.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/team-america-age-profile.json) |
| **Jugador (`person` / `player`)** | `players[].id` | `5ysw10inm8syf7r9xvbpk9n11` | **Henry Martín** (Club América) | [team-america-age-profile.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/team-america-age-profile.json) |
| **Partido (`fixture` / `match`)** | `fixtureId` / `/match/{uuid}` | `9dy7dhz5f13b2ejz2a5tok2l0` | **Pumas UNAM 2-2 Club América** (J16 Apertura 2026) | [match-1535061-all-player-cards.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/match-1535061-all-player-cards.json) |

> [!IMPORTANT]
> En [04-player-data-bootstrap.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/04-player-data-bootstrap.json) y en [30-player-tabs-compare-desempeno-modals-request-62-request.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/30-player-tabs-compare-desempeno-modals-request-62-request.json), el campo `season_tmcl` (y `seasonOptions` con 80 UUIDs de calendarios de temporada entre `2025`, `2025/2026`, `2026`, `2026/2027` y `2027`) expone explícitamente la nomenclatura oficial de Opta SDAPI (`tmcl` = **Tournament Calendar**), mientras que `tournamentOptions` expone los UUIDs de etapa Opta bajo el prefijo `STAGE_{opta_stage_uuid}` (ej. `STAGE_74623a6zmmk15vosebdok4kr8`).

#### D. Catálogo Rosetta de 177 Atributos Opta SDAPI ([rosetta-177-opta-attributes-catalog.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/rosetta-177-opta-attributes-catalog.json)) y Sistema de Coordenadas Opta $[0, 100] \times [0, 100]$ (`[OBSERVADO]`)
1. **Catálogo maestro de 13 categorías y 177 atributos con nombres exactos Opta SDAPI TM3/MA2:**
   En [rosetta-177-opta-attributes-catalog.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/rosetta-177-opta-attributes-catalog.json) (extraído de `playersFilterDraft` en [players-filter-draft-config.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/players-filter-draft-config.json), `ev_04b1ede55ec1bd3f547cd81c48dc5a1fc2e4e8b8f9a9020481a3e35092a126e8`), el selector de filtros de `/players` utiliza como clave primaria `key` **exactamente el nombre en inglés de la métrica en los feeds `TM3`/`MA2` de Opta SDAPI** (176 métricas Opta + `skore` = **177 atributos** repartidos en **13 categorías**: `Balón Parado` [11], `Creación` [13], `Defensa` [15], `Disciplina` [6], `Duelos` [9], `Errores` [2], `Finalización` [27], `General` [14], `Juego Aéreo` [11], `Pase` [21], `Portero` [29], `Posesión` [16], `Progresión` [3]):
   - `"key": "Corners Taken (incl short corners)"` $\rightarrow$ `"label": "Córners cobrados (incl. cortos)"` (`units: ["p90", "total"]`).
   - `"key": "Time Played"` $\rightarrow$ `"label": "Minutos jugados"` (`units: ["total"]`).
   - `"key": "Assists (Intentional)"` $\rightarrow$ `"label": "Asistencias intencionales"` (`units: ["p90", "total"]`).
   - `"key": "Expected Assists Openplay"` $\rightarrow$ `"label": "xA en juego abierto"` (`units: ["p90", "total"]`).
   - `"key": "Expected Threat"` / `"Expected Threat Passes"` / `"Expected Threat Carries"` $\rightarrow$ categoría `Progresión`.
   - `"key": "PutThrough/Blocked Distribution"` y `"PutThrough/Blocked Distribution Won"` $\rightarrow$ categoría `Defensa`.
   - `"key": "Total Successful Passes ( Excl Crosses & Corners )"` (conservando incluso los espacios internos de los feeds clásicos de Opta).
2. **Coordenadas espaciales Opta $[0, 100] \times [0, 100]$ y Goalmouth $[44.2, 55.8] \times [0, 38]$ (`[OBSERVADO]`):**
   - En [event-map.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/event-map.js) (líneas 16–20), [team-pass-network.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/team-pass-network.js), [team-formation-profile.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/team-formation-profile.js) y [heatmap.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/heatmap.js) (líneas 95–103), todas las coordenadas $(x, y)$ de eventos están expresadas en el sistema estándar de Opta $[0, 100] \times [0, 100]$ (donde $x \in [0, 100]$ va de línea de fondo propia a línea de fondo rival, e $y \in [0, 100]$ va de banda derecha a banda izquierda), proyectándose al canvas/SVG de cancha de $105 \times 68$ metros mediante:
     $$X_{\text{svg}} = \frac{x}{100} \times 105, \qquad Y_{\text{svg}} = \frac{100 - y}{100} \times 68$$
   - En [goalmouth-map.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/goalmouth-map.js) (líneas 15–17), el mapa de portería utiliza exactamente los calificadores de boca de portería de Opta (`Qualifier 102` = `Goalmouth Y`, `Qualifier 103` = `Goalmouth Z`):
     ```js
     // Opta goalmouth coordinates: y in ~[44.2, 55.8] (post to post, 55.8 = keeper's right / viewer's left),
     // z in [0, ~38] (ground to crossbar). Outside that = off-target.
     const Y_POST_LEFT = 55.8;
     const Y_POST_RIGHT = 44.2;
     const Z_CROSSBAR = 38.0;
     ```

---

### 1.2. Pruebas Irrefutables del Proveedor 2 (Secundario de Media y Cross-Reference): API-Football (`api-sports.io`)

Mientras que Opta SDAPI provee todos los UUIDs de 25 caracteres y las estadísticas/eventos, **Opta no incluye fotografías recortadas de jugadores ni escudos PNG listos para web en su paquete básico de feeds**. Para resolver esto, Statiskicks mantiene en su base de datos una tabla de mapeo cruzado (`opta_uuid` $\leftrightarrow$ `api_football_id`) contra **API-Football (`v3.football.api-sports.io`)** (`[OBSERVADO]` en [rosetta-40-leagues-opta-apifootball.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/rosetta-40-leagues-opta-apifootball.json), [rosetta-teams-opta-apifootball.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/rosetta-teams-opta-apifootball.json) y [30-player-tabs-compare-desempeno-modals-request-63-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/30-player-tabs-compare-desempeno-modals-request-63-response.json)):

#### A. Fotografías Primarias de Jugadores Servidas Directamente desde `media.api-sports.io` (`[OBSERVADO]`)
Las fotografías primarias de jugadores apuntan directamente al CDN oficial de API-Football (`https://media.api-sports.io/football/players/{api_football_player_id}.png`), incluyendo las estrellas de portada, los planteles de Liga MX y los 20 resultados multi-liga de `GET /players/search?q=Luis` ([30-player-tabs-compare-desempeno-modals-request-63-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/30-player-tabs-compare-desempeno-modals-request-63-response.json)):

| Jugador | UUID Opta en Statiskicks (`/player/{uuid}`) | URL de Fotografía (`image` / `photo`) | ID Entero API-Football | Evidencia Fuente |
|---|---|---|---|---|
| **Lionel Messi** | `c5ryhn04g9goikd0blmh83aol` | `https://media.api-sports.io/football/players/154.png` | `154` | [search-messi.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/search-messi.json), [24-players-search-and-oauth-request-16-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/24-players-search-and-oauth-request-16-response.json) |
| **Trent Alexander-Arnold** | `6694fff742be1902267920726` | `https://media.api-sports.io/football/players/283.png` | `283` | [01-home.html](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/01-home.html) |
| **Keylor Navas** | `9sme7jykdv8msgfu0nxx6h39x` | `https://media.api-sports.io/football/players/731.png` | `731` | [match-1535061-all-player-cards.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/match-1535061-all-player-cards.json) |
| **Brahim Díaz** | `66b14855c9530871580964446` | `https://media.api-sports.io/football/players/744.png` | `744` | [01-home.html](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/01-home.html) |
| **Luís Maximiano** | `71p9z7bqvgzb5t115fmos6fop` | `https://media.api-sports.io/football/players/1470.png` | `1470` | [30-player-tabs-compare-desempeno-modals-request-63-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/30-player-tabs-compare-desempeno-modals-request-63-response.json) |
| **Luis Abram** | `652d6i0jem2jymjfzd8w0ndn9` | `https://media.api-sports.io/football/players/2418.png` | `2418` | [30-player-tabs-compare-desempeno-modals-request-63-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/30-player-tabs-compare-desempeno-modals-request-63-response.json) |
| **Luis Advíncula** | `ar47ws1sf2l4ulxx2afq2x2hh` | `https://media.api-sports.io/football/players/2419.png` | `2419` | [30-player-tabs-compare-desempeno-modals-request-63-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/30-player-tabs-compare-desempeno-modals-request-63-response.json) |
| **Julián Álvarez** | `66b14850c9530871580954502` | `https://media.api-sports.io/football/players/6009.png` | `6009` | [01-home.html](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/01-home.html) |
| **Henry Martín** | `5ysw10inm8syf7r9xvbpk9n11` | `https://media.api-sports.io/football/players/35603.png` | `35603` | [match-1535061-all-player-cards.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/match-1535061-all-player-cards.json) |
| **Álex Zendejas** | `i5f7g3p3e0i6zwc2bc9eglw5` | `https://media.api-sports.io/football/players/35885.png` | `35885` | [match-1535061-all-player-cards.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/match-1535061-all-player-cards.json) |
| **Pablo Bennevendo** | `2mcy76o0t3fqqdwtvc0v2n42y` | `https://media.api-sports.io/football/players/35904.png` | `35904` | [match-1535061-all-player-cards.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/match-1535061-all-player-cards.json) |
| **Luis Ángel Malagón** | `a1qs3b34p5u2s6mmlhdkgdp7t` | `https://media.api-sports.io/football/players/35930.png` | `35930` | [24-players-search-and-oauth-request-17-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/24-players-search-and-oauth-request-17-response.json) |
| **Luis Romo** | `1cyhpfi77dom7gmpuownxlcrt` | `https://media.api-sports.io/football/players/35970.png` | `35970` | [04-player.html](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/04-player.html) |
| **Érick Sánchez** | `54kcu71vtiz8xlkke60k394a1` | `https://media.api-sports.io/football/players/36093.png` | `36093` | [03b-team-full.html](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/03b-team-full.html), [match-1535061-all-player-cards.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/match-1535061-all-player-cards.json) |
| **César Huerta** | `48anl4qgpl4f13hkdkc2u9jhl` | `https://media.api-sports.io/football/players/36111.png` | `36111` | [match-1535061-all-player-cards.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/match-1535061-all-player-cards.json) |

#### B. Escudos de Clubes (`/storage/media/teams/{id}.png`) y Logos de las 40 Ligas (`/storage/media/leagues/{id}.png`) con IDs Canónicos de API-Football (`[OBSERVADO]`)
Los logos de las 40 competiciones ([rosetta-40-leagues-opta-apifootball.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/rosetta-40-leagues-opta-apifootball.json)) y los escudos de todos los clubes ([rosetta-teams-opta-apifootball.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/rosetta-teams-opta-apifootball.json)) se sirven desde el almacenamiento público de Laravel (`/storage/media/leagues/{api_football_league_id}.png` y `/storage/media/teams/{api_football_team_id}.png`), donde cada `{id}` numérico corresponde 1:1 con el ID entero canónico de `v3.football.api-sports.io`:

| Slug del Club (`rosetta-teams-opta-apifootball.json`) | UUID Opta SDAPI (`opta_team_uuid`) | ID Entero API-Football (`api_football_team_id`) | URL del Escudo en Statiskicks |
|---|---|---|---|
| `guadalajara` (Chivas) | `e603sojy77s4u0ypqds2v2a1g` | `2278` | `/storage/media/teams/2278.png` |
| `tigres-uanl` | `6hmo9mrlz73nwxkshwuu5vsfm` | `2279` | `/storage/media/teams/2279.png` |
| `tijuana` | `c1wcescnsnfuyv06enhwaoqr6` | `2280` | `/storage/media/teams/2280.png` |
| `toluca` | `3390h9hdgoxzzofnrpyktanuz` | `2281` | `/storage/media/teams/2281.png` |
| `monterrey` | `233335xtoe3e3phg3hp91xguq` | `2282` | `/storage/media/teams/2282.png` |
| `atlas` | `8jjxbd5vr23vhu1v5r21rzkrn` | `2283` | `/storage/media/teams/2283.png` |
| `santos-laguna` | `8yn3l36qkq1fxbw4ufmwyfyt9` | `2285` | `/storage/media/teams/2285.png` |
| `pumas-unam` | `ayabrorjqa1bj7jk1fdqu1t57` | `2286` | `/storage/media/teams/2286.png` |
| `club-america` | `eu8c408f59yx7egaqossbv25e` | `2287` | `/storage/media/teams/2287.png` |
| `necaxa` | `b7hn6knkuxbpj1i8rmzapns7b` | `2288` | `/storage/media/teams/2288.png` |
| `leon` | `2ei66pjfsrr6uxqp1bywq31lo` | `2289` | `/storage/media/teams/2289.png` |
| `queretaro` | `ccye1b5fvtq8tzlz0gosyw10b` | `2290` | `/storage/media/teams/2290.png` |
| `puebla` | `4kw25nmgmacpbvo24ttr994k5` | `2291` | `/storage/media/teams/2291.png` |
| `pachuca` | `cynfvfb31rml7xrlsnejf8r6j` | `2292` | `/storage/media/teams/2292.png` |
| `cruz-azul` | `1aw67co8uut64yckd3wbhy9t2` | `2295` | `/storage/media/teams/2295.png` |
| `juarez` | `ecphe4bqgmin2tzsohf50egvd` | `2298` | `/storage/media/teams/2298.png` |
| `atlante` | `evyhlelybkbj2vry2xhct08pb` | `2312` | `/storage/media/teams/2312.png` |
| `atletico-san-luis` | `54ph1k82y99hhjsf7m2usns8u` | `2314` | `/storage/media/teams/2314.png` |
| `inter-miami` | `7a7uyvix8axi28h7d3bwl4tbe` | `9568` | `/storage/media/teams/9568.png` |

---

### 1.3. Pruebas Irrefutables del Proveedor 3 (Terciario / Fallback de Avatares): FotMob CDN (`images.fotmob.com`) y FlagCDN (`[OBSERVADO]`)

Cuando un jugador registrado en Opta SDAPI carece de fotografía actualizada o mapeo en API-Football, Statiskicks recurre a un **tercer proveedor de imágenes en su tabla de reconciliación de jugadores**: el CDN oficial de **FotMob (`https://images.fotmob.com/image_resources/playerimages/{fotmob_id}.png`)** (`[OBSERVADO]` en [03b-team-full.html](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/03b-team-full.html) y [match-1535061-all-player-cards.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/match-1535061-all-player-cards.json)):

| Jugador | Club | UUID Opta SDAPI (`playerId`) | ID Entero FotMob (`fotmob_id`) | URL de Fotografía Fallback Servida | Evidencia Fuente |
|---|---|---|---|---|---|
| **Rodrigo Dourado** | Club América / Atlético San Luis | `6m3j7f1p9z2x8c4v5b6n7m8q9` | `1069546` | `https://images.fotmob.com/image_resources/playerimages/1069546.png` | [03b-team-full.html](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/03b-team-full.html) |
| **Cristian Borja** | Club América | `csvbc0k1f54418nn8pjhg8ull` | `690073` | `https://images.fotmob.com/image_resources/playerimages/690073.png` | [03b-team-full.html](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/03b-team-full.html), [team-america-age-profile.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/team-america-age-profile.json) |
| **Sebastián Cáceres** | Club América | `claujooxyw4dzynzmy752r3l5` | `609892` | `https://images.fotmob.com/image_resources/playerimages/609892.png` | [03b-team-full.html](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/03b-team-full.html), [team-america-age-profile.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/team-america-age-profile.json) |

---

## 2. Catálogo Completo de las 40 Competiciones y Matriz de Tiers ([rosetta-40-leagues-opta-apifootball.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/rosetta-40-leagues-opta-apifootball.json)) (`[OBSERVADO]`)

Consolidado en [rosetta-40-leagues-opta-apifootball.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/rosetta-40-leagues-opta-apifootball.json) a partir de [10-leagues.html](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/10-leagues.html) (`ev_643a343e34fadc05f5e77db59a547ec794b7b026f0f8da2458052732d6c28445`), [29-league-tabs-and-team-subtabs-capture.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/29-league-tabs-and-team-subtabs-capture.json) (`ev_a1d8facdf931a87bf33ba5e703e23d73cd2ee0c4550557ba3b84cdb9a1c10088`) y [players-filter-draft-config.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/players-filter-draft-config.json) (`ev_04b1ede55ec1bd3f547cd81c48dc5a1fc2e4e8b8f9a9020481a3e35092a126e8`). Statiskicks cubre exactamente **40 competiciones** (`36` masculinas y `4` femeninas), divididas en **9 ligas abiertas en el plan gratuito (`Free / Fan` · datos `Scout`)** con `defaultLeagueId = "2hsidwomhjsaaytdy9u5niyi4"` (Liga MX) y **31 ligas bloqueadas tras el paywall de suscripción (`Locked / Plus` · \$129 MXN/mes)**:

| # | UUID Opta Competición (`opta_competition_uuid`) | ID API-Football (`api_football_league_id`) | Nombre de la Competición (`name`) | País (`country` / `country_es`) | Género (`gender`) | Tier (`Free / Fan` vs `Locked / Plus`) | Cobertura de Temporadas (`default_season` y `season_coverage`) |
|---|---|---|---|---|---|---|---|
| 1 | `6by3h89i2eykc341oz7lv1ddd` | `78` | **Bundesliga** | `GERMANY` (Alemania · `de`) | `male` | `Free / Fan` (`Scout`) | Default: `2026/2027` · `{"2026/2027": true, "2025/2026": true}` |
| 2 | `2hsidwomhjsaaytdy9u5niyi4` | `262` | **Liga MX** *(Default League)* | `MEXICO` (México · `mx`) | `male` | `Free / Fan` (`Scout`) | Default: `2026/2027` · `{"2026/2027": true, "2025/2026": true}` |
| 3 | `581t4mywybx21wcpmpykhyzr3` | `128` | **Liga Profesional Argentina** | `ARGENTINA` (Argentina · `ar`) | `male` | `Free / Fan` (`Scout`) | Default: `2026` · `{"2026": true, "2025": true}` |
| 4 | `dm5ka0os1e3dxcp3vh05kmp33` | `61` | **Ligue 1** | `FRANCE` (Francia · `fr`) | `male` | `Free / Fan` (`Scout`) | Default: `2026/2027` · `{"2026/2027": true, "2025/2026": true}` |
| 5 | `287tckirbfj9nb8ar2k9r60vn` | `253` | **MLS** | `USA` (Estados Unidos · `us`) | `male` | `Free / Fan` (`Scout`) | Default: `2026` · `{"2027": false, "2026": true, "2025": true}` |
| 6 | `2kwbbcootiqqgmrzs6o5inle5` | `39` | **Premier League** | `ENGLAND` (Inglaterra · `gb-eng`) | `male` | `Free / Fan` (`Scout`) | Default: `2026/2027` · `{"2026/2027": true, "2025/2026": true}` |
| 7 | `34pl8szyvrbwcmfkuocjm3r6t` | `140` | **Primera División (LaLiga)** | `SPAIN` (España · `es`) | `male` | `Free / Fan` (`Scout`) | Default: `2026/2027` · `{"2026/2027": true, "2025/2026": true}` |
| 8 | `1r097lpxe0xn03ihb7wi98kao` | `135` | **Serie A** | `ITALY` (Italia · `it`) | `male` | `Free / Fan` (`Scout`) | Default: `2026/2027` · `{"2026/2027": true, "2025/2026": true}` |
| 9 | `scf9p4y91yjvqvg5jndxzhxj` | `71` | **Serie A (Brasileirão)** | `BRAZIL` (Brasil · `br`) | `male` | `Free / Fan` (`Scout`) | Default: `2026` · `{"2026": true, "2025": true}` |
| 10 | `722fdbecxzcq9788l6jqclzlw` | `79` | **2. Bundesliga** | `GERMANY` | `male` | `Locked / Plus` | Bloqueada en Fan (`2026/2027`, `2025/2026` en `teamsFilterDraft`) |
| 11 | `7ntvbsyq31jnzoqoa8850b9b8` | `40` | **Championship** | `ENGLAND` | `male` | `Locked / Plus` | Bloqueada en Fan (`2026/2027`, `2025/2026` en `teamsFilterDraft`) |
| 12 | `5y0z0l2epprzbscvzsgldw8vu` | `250` | **Division Profesional** | `PARAGUAY` | `male` | `Locked / Plus` | Bloqueada en Fan (`2026`, `2025` en `teamsFilterDraft`) |
| 13 | `akmkihra9ruad09ljapsm84b3` | `88` | **Eredivisie** | `NETHERLANDS` | `male` | `Locked / Plus` | Bloqueada en Fan (`2026/2027`, `2025/2026` en `teamsFilterDraft`) |
| 14 | `4zwgbb66rif2spcoeeol2motx` | `144` | **First Division A** | `BELGIUM` | `male` | `Locked / Plus` | Bloqueada en Fan (`2026/2027`, `2025/2026` en `teamsFilterDraft`) |
| 15 | `1b70m6qtxrp75b4vtk8hxh8c3` | `210` | **HNL** | `CROATIA` | `male` | `Locked / Plus` | Bloqueada en Fan (`2026/2027`, `2025/2026` en `teamsFilterDraft`) |
| 16 | `a9vrdkelbgif0gtu3wxsr75xo` | `281` | **Liga 1** | `PERU` | `male` | `Locked / Plus` | Bloqueada en Fan (`2026`, `2025` en `teamsFilterDraft`) |
| 17 | `7ut48s80k421xixh6ev5i6h62` | `673` | **Liga MX Femenil** | `MEXICO` | `female` | `Locked / Plus` | Bloqueada en Fan (`2026/2027`, `2025/2026` en `teamsFilterDraft`) |
| 18 | `6lwpjhktjhl9g7x2w7njmzva6` | `242` | **Liga Pro** | `ECUADOR` | `male` | `Locked / Plus` | Bloqueada en Fan (`2026`, `2025` en `teamsFilterDraft`) |
| 19 | `e1kxdivp5g4cpldgpwvnzl1vv` | `263` | **Liga de Expansión MX** | `MEXICO` | `male` | `Locked / Plus` | Bloqueada en Fan (`2026/2027`, `2025/2026` en `teamsFilterDraft`) |
| 20 | `5qmjkpvi92vrzdcb2knassjkk` | `909` | **MLS Next Pro** | `USA` | `male` | `Locked / Plus` | Bloqueada en Fan (`2026`, `2025` en `teamsFilterDraft`) |
| 21 | `djkvh1luqdkdixpoe653lzixg` | `254` | **NWSL** | `USA` | `female` | `Locked / Plus` | Bloqueada en Fan (`2026`, `2025` en `teamsFilterDraft`) |
| 22 | `3ab1uwtoyjopdj1y1fynyy9jg` | `235` | **Premier League** | `RUSSIA` | `male` | `Locked / Plus` | Bloqueada en Fan (`2026/2027`, `2025/2026` en `teamsFilterDraft`) |
| 23 | `e21cf135btr8t3upw0vl6n6x0` | `179` | **Premiership** | `SCOTLAND` | `male` | `Locked / Plus` | Bloqueada en Fan (`2026/2027`, `2025/2026` en `teamsFilterDraft`) |
| 24 | `8yi6ejjd1zudcqtbn07haahg6` | `94` | **Primeira Liga** | `PORTUGAL` | `male` | `Locked / Plus` | Bloqueada en Fan (`2026/2027`, `2025/2026` en `teamsFilterDraft`) |
| 25 | `2ty8ihceabty8yddmu31iuuej` | `239` | **Primera A** | `COLOMBIA` | `male` | `Locked / Plus` | Bloqueada en Fan (`2026`, `2025` en `teamsFilterDraft`) |
| 26 | `2y8bntiif3a9y6gtmauv30gt` | `265` | **Primera División** | `CHILE` | `male` | `Locked / Plus` | Bloqueada en Fan (`2026`, `2025` en `teamsFilterDraft`) |
| 27 | `46b141eaqq9q7o4gz5gtdpikk` | `299` | **Primera División** | `VENEZUELA` | `male` | `Locked / Plus` | Bloqueada en Fan (`2026`, `2025` en `teamsFilterDraft`) |
| 28 | `5k620c7y6dlbmcm88dt3eb7t` | `142` | **Primera División Femenina** | `SPAIN` | `female` | `Locked / Plus` | Bloqueada en Fan (`2026/2027`, `2025/2026` en `teamsFilterDraft`) |
| 29 | `ea0h6cf3bhl698hkxhpulh2zz` | `307` | **Saudi League** | `SAUDI ARABIA` | `male` | `Locked / Plus` | Bloqueada en Fan (`2026/2027`, `2025/2026` en `teamsFilterDraft`) |
| 30 | `3is4bkgf3loxv9qfg3hm8zfqb` | `141` | **Segunda División** | `SPAIN` | `male` | `Locked / Plus` | Bloqueada en Fan (`2026/2027`, `2025/2026` en `teamsFilterDraft`) |
| 31 | `8ey0ww2zsosdmwr8ehsorh6t7` | `136` | **Serie B** | `ITALY` | `male` | `Locked / Plus` | Bloqueada en Fan (`2026/2027`, `2025/2026` en `teamsFilterDraft`) |
| 32 | `5zr0b05eyx25km7z1k03ca9jx` | `72` | **Serie B** | `BRAZIL` | `male` | `Locked / Plus` | Bloqueada en Fan (`2026`, `2025` en `teamsFilterDraft`) |
| 33 | `xaouuwuk8qyhv1libkeexwjh` | `305` | **Stars League** | `QATAR` | `male` | `Locked / Plus` | Bloqueada en Fan (`2026/2027`, `2025/2026` en `teamsFilterDraft`) |
| 34 | `e0lck99w8meo9qoalfrxgo33o` | `207` | **Super League** | `SWITZERLAND` | `male` | `Locked / Plus` | Bloqueada en Fan (`2026/2027`, `2025/2026` en `teamsFilterDraft`) |
| 35 | `c0r21rtokgnbtc0o2rldjmkxu` | `197` | **Super League 1** | `GREECE` | `male` | `Locked / Plus` | Bloqueada en Fan (`2026/2027`, `2025/2026` en `teamsFilterDraft`) |
| 36 | `29actv1ohj8r10kd9hu0jnb0n` | `119` | **Superliga** | `DENMARK` | `male` | `Locked / Plus` | Bloqueada en Fan (`2026/2027`, `2025/2026` en `teamsFilterDraft`) |
| 37 | `482ofyysbdbeoxauk19yg7tdt` | `203` | **Süper Lig** | `TÜRKIYE` | `male` | `Locked / Plus` | Bloqueada en Fan (`2026/2027`, `2025/2026` en `teamsFilterDraft`) |
| 38 | `c1d9p6b2e9zr5tqlzx3ktjplg` | `255` | **USL Championship** | `USA` | `male` | `Locked / Plus` | Bloqueada en Fan (`2026`, `2025` en `teamsFilterDraft`) |
| 39 | `jznihqxle06xych9ygwiwnsa` | `489` | **USL League One** | `USA` | `male` | `Locked / Plus` | Bloqueada en Fan (`2026`, `2025` en `teamsFilterDraft`) |
| 40 | `6vq8j5p3av14nr3iuyi4okhjt` | `44` | **Women's Super League** | `ENGLAND` | `female` | `Locked / Plus` | Bloqueada en Fan (`2026/2027`, `2025/2026` en `teamsFilterDraft`) |

---

## 3. Esquemas de Datos y Payloads por Dominio

Statiskicks emplea dos mecanismos de transporte de datos hacia el cliente (`[OBSERVADO]`):
1. **Hidratación inicial por atributos HTML `data-*` y bloques `<script type="application/json" x-ref="...">`:** Los componentes complejos en D3/SVG/Canvas (`attribute-charts.js`, `team-profile.js`, `team-xg-rolling.js`, `team-age-profile.js`, `team-formation-profile.js`, `momentum-chart.js`, `event-map.js`, `league-maps.js`) leen su estado inicial o serie completa desde un atributo HTML escapado con `htmlspecialchars`.
2. **Llamadas RPC asíncronas sobre Laravel Livewire v3 (`POST /livewire-e3175f40/update`) y endpoint REST ligero (`GET /search?q=`):** Cuando el usuario cambia de pestaña (`setTab`), solicita un mapa de eventos (`loadMapGraphData`, `loadLeagueMap`, `loadPlayerEvents`) o filtra un gráfico de dispersión (`loadScatter`), Alpine/Livewire invoca métodos públicos del componente PHP devolviendo ya sea nuevo HTML hidratado (`effects.html`) o un payload JSON directo (`effects.returns[0]`).

---

### 3.1. APIs REST de Búsqueda (`GET /search?q=...` y `GET /players/search?q=...`) (`[OBSERVADO]`)

#### A. Búsqueda Global Omnibox (`GET /search?q=...`) (`[OBSERVADO]`)
- **Evidencia:** [02-search-api-capture.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/02-search-api-capture.json) (`ev_296f62498cf90c3e87cd48ef454168c2d290f4a839a442208f9adfef04c8aeda`), [search-america.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/search-america.json), [search-messi.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/search-messi.json), [search-madrid.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/search-madrid.json) y el script [search-results-image.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/search-results-image.js).
- **Endpoint:** `GET https://www.statiskicks.com/search?q={query}` (requiere al menos 2 caracteres; devuelve un arreglo JSON plano de hasta ~10–15 coincidencias mixtas de equipos, jugadores y ligas ordenadas por relevancia/popularidad).

##### Esquema JSON del Contrato `/search?q=`
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

##### Ejemplos Reales Capturados (`search-america.json`, `search-messi.json`, `search-madrid.json`)
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

#### B. Endpoint REST Dedicado de Búsqueda de Jugadores (`GET /players/search?q=...`) (`[OBSERVADO]`)
- **Evidencia:**
  - [24-players-search-and-oauth-capture.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/24-players-search-and-oauth-capture.json) (`ev_335de9032833d29fc76238a8c934e4cf676b276ceba699de0417f730b7bc9f66`), [24-players-search-and-oauth-request-16-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/24-players-search-and-oauth-request-16-response.json) (`3,577 B`, `GET /players/search?q=messi`) y [24-players-search-and-oauth-request-17-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/24-players-search-and-oauth-request-17-response.json) (`806 B`, `GET /players/search?q=malagon`).
  - **Captura Wave 3 (`GET /players/search?q=Luis`):** [30-player-tabs-compare-desempeno-modals-request-63-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/30-player-tabs-compare-desempeno-modals-request-63-response.json) (`7,418 B`, `ev_9435086f6ae02ff0707fefa83c7cf473eda660deed890524e621cb9825c97446`).
- **Propósito y Diferencia con `/search`:** Mientras que `/search` alimenta la omnibox de la barra de navegación superior con un arreglo plano de entidades heterogéneas, el selector de comparación de jugadores (`playerComparison` en [attribute-charts.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/attribute-charts.js)) y el buscador específico de `/players` consumen `GET https://www.statiskicks.com/players/search?q={query}`. Este endpoint devuelve un objeto envolvente `{ results: PlayerSearchResultItem[] }` con hasta **20 jugadores multi-liga** enriquecidos con el UUID Opta explícito (`id`), el nombre legal completo de registro en Opta (`name`), el nombre corto (`short_name`), el código ISO-2 de bandera (`flag`), la fotografía de API-Football (`image`), el `competition_id` Opta y el booleano `locked` (`false` para las 9 ligas abiertas del plan `Free / Fan` y `true` para las 31 ligas `Plus`).

##### Esquema JSON del Contrato `/players/search?q=` (`[OBSERVADO]`)
```typescript
interface PlayersSearchResponse {
  results: PlayerSearchResultItem[]; // Hasta 20 coincidencias multi-liga ordenadas alfabéticamente
}

interface PlayerSearchResultItem {
  id: string;             // UUID Opta SDAPI del jugador (25 chars base-36, ej. "c5ryhn04g9goikd0blmh83aol")
  name: string;           // Nombre legal completo en Opta (ej. "Lionel Andrés Messi Cuccittini")
  short_name: string;     // Nombre abreviado de camiseta/UI (ej. "L. Messi", "L. Malagón")
  role: "Portero" | "Defensa" | "Mediocampista" | "Delantero"; // Línea posicional en español
  team: string;           // Club actual (ej. "Inter Miami", "Club América")
  image: string | null;   // Fotografía API-Football ("https://media.api-sports.io/football/players/{id}.png") o null
  flag: string;           // Código ISO 3166-1 alpha-2 para FlagCDN (ej. "ar", "mx", "co", "pt", "gb-sct")
  competition_id: string; // UUID Opta SDAPI de la liga actual (ej. "287tckirbfj9nb8ar2k9r60vn")
  url: string;            // URL absoluta canónica ("https://www.statiskicks.com/player/{id}/{slug}")
  locked: boolean;        // false en las 9 ligas abiertas (Scout); true en las 31 ligas Plus
}
```

##### Payloads Reales Capturados (`24-players-search-and-oauth-request-16/17-response.json` y `30-player-tabs-compare-desempeno-modals-request-63-response.json`) (`[OBSERVADO]`)
```json
// GET /players/search?q=Luis (extracto de los 20 resultados en 30-player-tabs-compare-desempeno-modals-request-63-response.json · 7,418 B)
{
  "results": [
    {
      "id": "945ich4c3i3w208odtwvqfluy",
      "name": "Luis Ignacio Abraham",
      "short_name": "Ignacio Abraham",
      "role": "Defensa",
      "team": "Banfield",
      "image": "https://media.api-sports.io/football/players/58486.png",
      "flag": "",
      "competition_id": "581t4mywybx21wcpmpykhyzr3",
      "url": "https://www.statiskicks.com/player/945ich4c3i3w208odtwvqfluy/luis-abraham",
      "locked": false
    },
    {
      "id": "652d6i0jem2jymjfzd8w0ndn9",
      "name": "Luis Alfonso Abram Ugarelli",
      "short_name": "L. Abram",
      "role": "Defensa",
      "team": "Sporting Cristal",
      "image": "https://media.api-sports.io/football/players/2418.png",
      "flag": "pe",
      "competition_id": "a9vrdkelbgif0gtu3wxsr75xo",
      "url": "https://www.statiskicks.com/player/652d6i0jem2jymjfzd8w0ndn9/luis-abram",
      "locked": true
    },
    {
      "id": "ar47ws1sf2l4ulxx2afq2x2hh",
      "name": "Luis Jan Piers Advíncula Castrillón",
      "short_name": "L. Advíncula",
      "role": "Defensa",
      "team": "Alianza Lima",
      "image": "https://media.api-sports.io/football/players/2419.png",
      "flag": "pe",
      "competition_id": "a9vrdkelbgif0gtu3wxsr75xo",
      "url": "https://www.statiskicks.com/player/ar47ws1sf2l4ulxx2afq2x2hh/luis-advincula",
      "locked": true
    },
    {
      "id": "z3jmigxgq8yvv6klslbg3axg",
      "name": "Luisa Fernanda Agudelo Morelo",
      "short_name": "L. Agudelo",
      "role": "Portero",
      "team": "San Diego Wave",
      "image": null,
      "flag": "co",
      "competition_id": "djkvh1luqdkdixpoe653lzixg",
      "url": "https://www.statiskicks.com/player/z3jmigxgq8yvv6klslbg3axg/luisa-agudelo",
      "locked": true
    },
    {
      "id": "71p9z7bqvgzb5t115fmos6fop",
      "name": "Luís Manuel Arantes Maximiano",
      "short_name": "Luís Maximiano",
      "role": "Portero",
      "team": "NEOM",
      "image": "https://media.api-sports.io/football/players/1470.png",
      "flag": "pt",
      "competition_id": "ea0h6cf3bhl698hkxhpulh2zz",
      "url": "https://www.statiskicks.com/player/71p9z7bqvgzb5t115fmos6fop/luis-arantes",
      "locked": true
    },
    {
      "id": "d7efidcaz053ml8l4h19i7fmx",
      "name": "Luis Eduardo Barraza",
      "short_name": "L. Barraza",
      "role": "Portero",
      "team": "Inter Miami",
      "image": "https://media.api-sports.io/football/players/50847.png",
      "flag": "us",
      "competition_id": "287tckirbfj9nb8ar2k9r60vn",
      "url": "https://www.statiskicks.com/player/d7efidcaz053ml8l4h19i7fmx/luis-barraza",
      "locked": false
    }
  ]
}
```
```json
// GET /players/search?q=messi (extracto de 24-players-search-and-oauth-request-16-response.json · 3,577 B)
{
  "results": [
    {
      "id": "c5ryhn04g9goikd0blmh83aol",
      "name": "Lionel Andrés Messi Cuccittini",
      "short_name": "L. Messi",
      "role": "Delantero",
      "team": "Inter Miami",
      "image": "https://media.api-sports.io/football/players/154.png",
      "flag": "ar",
      "competition_id": "287tckirbfj9nb8ar2k9r60vn",
      "url": "https://www.statiskicks.com/player/c5ryhn04g9goikd0blmh83aol/lionel-messi",
      "locked": false
    },
    {
      "id": "5p0z19ntbb5q2fd4f8ba0159l",
      "name": "Juniororo Messias",
      "short_name": "Junior Messias",
      "role": "Mediocampista",
      "team": "Genoa",
      "image": "https://media.api-sports.io/football/players/56474.png",
      "flag": "br",
      "competition_id": "1r097lpxe0xn03ihb7wi98kao",
      "url": "https://www.statiskicks.com/player/5p0z19ntbb5q2fd4f8ba0159l/junior-messias",
      "locked": false
    }
  ]
}
```
```json
// GET /players/search?q=malagon (íntegro de 24-players-search-and-oauth-request-17-response.json · 806 B)
{
  "results": [
    {
      "id": "ezxcokuvyr0f5v83o0bj8ti39",
      "name": "Jerson Andrés Malagón Piracún",
      "short_name": "J. Malagón",
      "role": "Defensa",
      "team": "Deportivo Pasto",
      "image": null,
      "flag": "co",
      "competition_id": "2ty8ihceabty8yddmu31iuuej",
      "url": "https://www.statiskicks.com/player/ezxcokuvyr0f5v83o0bj8ti39/j-malagon",
      "locked": true
    },
    {
      "id": "a1qs3b34p5u2s6mmlhdkgdp7t",
      "name": "Luis Ángel Malagón Velázquez",
      "short_name": "L. Malagón",
      "role": "Portero",
      "team": "Club América",
      "image": "https://media.api-sports.io/football/players/35930.png",
      "flag": "mx",
      "competition_id": "2hsidwomhjsaaytdy9u5niyi4",
      "url": "https://www.statiskicks.com/player/a1qs3b34p5u2s6mmlhdkgdp7t/luis-malagon",
      "locked": false
    }
  ]
}
```

---

### 3.2. Payloads de Atributos, Radares y Barras Comparativas (`data-attribute-charts-payload`) (`[OBSERVADO]`)

- **Evidencia:**
  - Equipo: [team-america-attribute-charts.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/team-america-attribute-charts.json) (`120,440 B`) y [03-team-data-attribute-charts-payload.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/03-team-data-attribute-charts-payload.json) (`119.5 KB`, `ev_aa5f2d74196b21062c132e8b6ec8934f023380f93c40f78f99e333a43bfc9977` / `ev_a1d8facdf931a87bf33ba5e703e23d73cd2ee0c4550557ba3b84cdb9a1c10088`) generado por `OptaTeamAttributeService::forTeam()`.
  - Jugador: [04-player-data-attribute-charts-payload.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/04-player-data-attribute-charts-payload.json) (`45.1 KB`, `ev_59e57f74d8e4894a8c290cd1f58354701d398bea6301f1cdfe07edeeef89f945`) y [rosetta-177-opta-attributes-catalog.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/rosetta-177-opta-attributes-catalog.json) (`13` categorías, `177` atributos) generado por `OptaSeasonStatsService::buildTraitsData()`.
  - Consumidor JS: [attribute-charts.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/attribute-charts.js).

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

#### C. Perfil de Portero (`role: "GK"`): Catálogo de 176 Traits en 13 Categorías, las 29 Métricas de `Portero` y los 11 Ejes del Radar (`27-goalkeeper-rpc-request-44-response.json` · `144,401 B`) (`[OBSERVADO]`)

- **Evidencia:** [27-goalkeeper-rpc-capture.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/27-goalkeeper-rpc-capture.json) (`ev_fe42082ccfb04731fd689598d84d1596a35361d94ca19ba7707e87a1c1fc8ab0`) y [27-goalkeeper-rpc-request-44-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/27-goalkeeper-rpc-request-44-response.json) (`144,401 B`) para **Luis Ángel Malagón** (`/player/a1qs3b34p5u2s6mmlhdkgdp7t/luis-malagon`, Club América, Liga MX `2026/2027`).
- **Diferencia estructural entre jugador de campo y portero (`[OBSERVADO]`):**
  - Mientras un jugador de campo (`DFCI`, `AMW`, etc.) recibe **147 traits en 12 categorías**, el servicio `OptaSeasonStatsService::buildTraitsData()` para un portero (`player_role: "GK"`) devuelve **176 traits en 13 categorías**, incorporando la categoría exclusiva **`Portero` con 29 métricas específicas de arquero** y comparando contra una cohorte posicional de **$N = 24$ porteros** con $>270$ minutos en la Liga MX `2026/2027` (`same_position_same_league: { rank: 16, total: 24, rating: 6.46, min_rating: 6.13 }`, `all_positions_same_league: { rank: 334, total: 402, rating: 6.46, min_rating: 6.07 }`).
  - El radar por defecto (`defaultVisible: true`) de un portero consta de **11 ejes** (9 de la categoría `Portero`, 1 de `Pase` y 1 de `Posesión`): `forward_passes`, `clean_sheets`, `drops`, `expected_goals_conceded`, `goals_prevented`, `save_percentage`, `goalkeeper_smother`, `punches`, `saves_made`, `successful_launches` y `touches`.

##### Tabla de las 29 Métricas de la Categoría `Portero` + los 2 Ejes Adicionales del Radar de Arquero (`27-goalkeeper-rpc-request-44-response.json`) (`[OBSERVADO]`)

| # | `key` | `label` (Español) | `raw_name` (Opta Inglés) | Categoría | Unidad | Menos es Mejor | Radar Default (`defaultVisible`) | Valor p90 (`val`) | Media Porteros (`population_average`) | Percentil | Ranking (`N=24`) | Total Temporada (`total.val`) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `catches` | Centros atrapados | `Catches` | Portero | `per_90` | No | No | 0.17 | 0.34 | 26.09 | 16/24 | 1 |
| 2 | `clean_sheets` | Porterías invictas | `Clean Sheets` | Portero | `per_90` | No | **Sí** | 0 | 0.21 | 0 | 23/24 | 0 |
| 3 | `drops` | Balones soltados | `Drops` | Portero | `per_90` | **Sí** | **Sí** | 0.5 | 0.09 | 0 | 24/24 | 3 |
| 4 | `expected_goals_conceded` | xG concedidos | `Expected Goals Conceded` | Portero | `per_90` | **Sí** | **Sí** | 1.52 | 1.52 | 52.17 | 12/24 | 9.15 |
| 5 | `non_penalty_expected_goals_conceded` | xG concedidos (excluyendo penales) | `Non-Penalty Expected Goals Conceded` | Portero | `per_90` | **Sí** | No | 1.07 | 1.3 | 78.26 | 6/24 | 6.44 |
| 6 | `expected_goals_on_target_conceded` | xGOT concedidos | `Expected Goals On Target Conceded` | Portero | `per_90` | **Sí** | No | 1.77 | 1.43 | 21.74 | 19/24 | 10.63 |
| 7 | `non_penalty_expected_goals_on_target_conceded` | xGOT concedidos (excluyendo penales) | `Non-Penalty Expected Goals On Target Conceded` | Portero | `per_90` | **Sí** | No | 1.31 | 1.21 | 30.43 | 17/24 | 7.86 |
| 8 | `gk_successful_distribution` | Saques con la mano o de piso exitosos | `GK Successful Distribution` | Portero | `per_90` | No | No | 5.67 | 5.66 | 47.83 | 13/24 | 34 |
| 9 | `gk_unsuccessful_distribution` | Saques con la mano o de piso fallados | `GK Unsuccessful Distribution` | Portero | `per_90` | **Sí** | No | 0.33 | 0.9 | 78.26 | 6/24 | 2 |
| 10 | `goal_kicks` | Saques de meta | `Goal Kicks` | Portero | `per_90` | No | No | 5.83 | 8.21 | 21.74 | 19/24 | 35 |
| 11 | `goals_conceded` | Goles concedidos | `Goals Conceded` | Portero | `per_90` | **Sí** | No | 2 | 1.52 | 13.04 | 21/24 | 12 |
| 12 | `goals_conceded_inside_box` | Goles concedidos dentro del área | `Goals Conceded Inside Box` | Portero | `per_90` | **Sí** | No | 1.67 | 1.31 | 17.39 | 20/24 | 10 |
| 13 | `goals_conceded_outside_box` | Goles concedidos fuera del área | `Goals Conceded Outside Box` | Portero | `per_90` | **Sí** | No | 0.33 | 0.21 | 21.74 | 19/24 | 2 |
| 14 | `goals_prevented` | Goles prevenidos | `Goals Prevented` | Portero | `per_90` | No | **Sí** | -0.23 | -0.09 | 13.04 | 21/24 | -1.37 |
| 15 | `save_percentage` | Efectividad de atajadas | `Save Percentage` | Portero | `percentage` | No | **Sí** | 57.14 | 69.61 | 4.35 | 23/24 | 57.14 |
| 16 | `goalkeeper_smother` | Achiques | `Goalkeeper Smother` | Portero | `per_90` | No | **Sí** | 0 | 0.11 | 0 | 17/24 | 0 |
| 17 | `penalties_faced` | Penales enfrentados | `Penalties Faced` | Portero | `per_90` | No | No | 0.5 | 0.27 | 86.96 | 3/24 | 3 |
| 18 | `penalties_saved` | Penales atajados | `Penalties Saved` | Portero | `per_90` | No | No | 0.17 | 0.05 | 95.65 | 1/24 | 1 |
| 19 | `penalty_goals_conceded` | Goles de penal concedidos | `Penalty Goals Conceded` | Portero | `per_90` | **Sí** | No | 0.33 | 0.22 | 17.39 | 19/24 | 2 |
| 20 | `punches` | Despejes con el puño | `Punches` | Portero | `per_90` | No | **Sí** | 1.33 | 0.49 | 100 | 1/24 | 8 |
| 21 | `saves_from_penalty` | Atajadas en penales | `Saves From Penalty` | Portero | `per_90` | No | No | 0.17 | 0.05 | 95.65 | 1/24 | 1 |
| 22 | `saves_made` | Atajadas | `Saves Made` | Portero | `per_90` | No | **Sí** | 2.67 | 3.42 | 4.35 | 23/24 | 16 |
| 23 | `saves_made_caught` | Atajadas con retención | `Saves Made - Caught` | Portero | `per_90` | No | No | 0 | 0.09 | 0 | 13/24 | 0 |
| 24 | `saves_made_parried` | Atajadas con desvío | `Saves Made - Parried` | Portero | `per_90` | No | No | 1.5 | 0.7 | 100 | 1/24 | 9 |
| 25 | `saves_made_from_inside_box` | Atajadas a remates dentro del área | `Saves Made from Inside Box` | Portero | `per_90` | No | No | 1 | 1.98 | 4.35 | 23/24 | 6 |
| 26 | `saves_made_from_outside_box` | Atajadas a remates fuera del área | `Saves Made from Outside Box` | Portero | `per_90` | No | No | 1.67 | 1.43 | 69.57 | 7/24 | 10 |
| 27 | `successful_launches` | Pases largos precisos | `Successful Launches` | Portero | `per_90` | No | **Sí** | 2 | 1.16 | 100 | 1/24 | 12 |
| 28 | `total_big_chances_saved` | Ocasiones claras atajadas | `Total Big Chances Saved` | Portero | `per_90` | No | No | 1 | 0.65 | 86.96 | 4/24 | 6 |
| 29 | `unsuccessful_launches` | Pases largos fallados | `Unsuccessful Launches` | Portero | `per_90` | **Sí** | No | 1.33 | 2.38 | 78.26 | 6/24 | 8 |
| *(+1)* | `forward_passes` | Pases hacia adelante | `Forward Passes` | Pase | `per_90` | No | **Sí** | 17 | 16.21 | 69.57 | 8/24 | 102 |
| *(+2)* | `touches` | Toques | `Touches` | Posesión | `per_90` | No | **Sí** | 37 | 39.65 | 17.39 | 19/24 | 222 |

#### D. Perfil de Mediapunta/Extremo (`role: "AMW"`) y Eventos de Hidratación RPC Livewire (`04b-messi-full-request-45/47-response.json`) (`[OBSERVADO]`)

- **Evidencia:** [04b-messi-full.html](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/04b-messi-full.html) (`ev_bba17f5b8205d109afaa59748445fa3e6b8b763f44c88cfbb1a22847a3d405b9`), [04b-messi-full-request-45-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/04b-messi-full-request-45-response.json) (`127,011 B`) y [04b-messi-full-request-47-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/04b-messi-full-request-47-response.json) (`53,530 B`) para **Lionel Messi** (`/player/c5ryhn04g9goikd0blmh83aol/lionel-messi`, Inter Miami, MLS `2026`), contrastados con [26-player-rpc-full-request-44-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/26-player-rpc-full-request-44-response.json) (`135,163 B`) y [request-46-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/26-player-rpc-full-request-46-response.json) (`27,484 B`) de Luis Romo.
- **Secuencia de hidratación asíncrona de `/player/{id}/{slug}` (`wire:init`) (`[OBSERVADO]`):**
  Al montar `PlayerDetail`, Livewire agrupa en dos peticiones `POST /livewire-e3175f40/update` cuatro llamadas RPC que despachan 4 eventos navegador/Alpine (`effects.dispatches`):
  1. **Lote RPC 1 (`request-45` en Messi / `request-44` en Romo y Malagón):**
     - `traits-data-updated`: Contiene `{ traitsData: PlayerTraitItem[], requestId: number }`. Para el rol táctico `AMW` (Mediapunta / Extremo ofensivo, cohorte de $N = 69$ jugadores en MLS `2026`), los **10 ejes por defecto del radar (`defaultVisible: true`)** son:
       1. `key_passes_attempt_assists` ("Pases clave", Creación): `val: 2.06` p90 (`total: 61`), `pop_avg: 1.52`, `pct: 82.35`, `rank: 13/69`.
       2. `successful_crosses_open_play` ("Centros exitosos de jugada", Creación): `val: 0.14` (`total: 4`), `pop_avg: 0.56`, `pct: 5.88`, `rank: 63/69`.
       3. `through_balls` ("Pases filtrados", Creación): `val: 0.78` (`total: 23`), `pop_avg: 0.19`, `pct: 98.53`, `rank: 2/69`.
       4. `non_penalty_goal_contributions` ("Goles producidos excluyendo penales", Finalización): `val: 1.28` (`total: 38`), `pop_avg: 0.43`, `pct: 100`, `rank: 1/69`.
       5. `final_third_touches` ("Toques en último tercio", Posesión): `val: 36.82` (`total: 1090`), `pop_avg: 22.87`, `pct: 97.06`, `rank: 3/69`.
       6. `overruns` ("Alargue de balón / pérdida", Posesión, `lowerIsBetter: true`): `val: 0.14` (`total: 4`), `pop_avg: 0.25`, `pct: 69.12`, `rank: 21/69`.
       7. `progressive_carries` ("Conducciones progresivas", Posesión): `val: 10.57` (`total: 313`), `pop_avg: 7.45`, `pct: 92.65`, `rank: 6/69`.
       8. `successful_dribbles` ("Regates exitosos", Posesión): `val: 2.09` (`total: 62`), `pop_avg: 1.38`, `pct: 88.24`, `rank: 9/69`.
       9. `total_losses_of_possession` ("Pérdidas de balón", Posesión, `lowerIsBetter: true`): `val: 15.95` (`total: 472`), `pop_avg: 14.37`, `pct: 32.35`, `rank: 47/69`.
       10. `total_touches_in_opposition_box` ("Toques en área rival", Posesión): `val: 6.86` (`total: 203`), `pop_avg: 4.19`, `pct: 92.65`, `rank: 6/69`.
     - `ranking-data-updated`: Contiene la posición del jugador en la distribución de `SKORE` dentro de su liga y en el universo de Top Ligas:
       ```json
       // Extracto de ranking-data-updated en 04b-messi-full-request-45-response.json
       {
         "rankingData": {
           "season_label": "2026",
           "player_role": "AMW",
           "league_name": "MLS",
           "league_mean_rating": 6.78,
           "top_leagues_mean_rating": null,
           "same_position_same_league": {
             "rank": 1,
             "total": 69,
             "rating": 8.29,
             "min_rating": 6.47
           },
           "all_positions_same_league": {
             "rank": 1,
             "total": 670,
             "rating": 8.29,
             "min_rating": 5.96
           },
           "same_position_top_leagues": null,
           "all_positions_top_leagues": null
         },
         "requestId": 1
       }
       ```
     - `performance-data-updated`: Entrega el historial de partidos de la temporada (`summaryMatches`), los conteos por sub-rol en la cancha (`positionCounts`: ej. en Messi `[{ "code": "MO", "count": 19 }, { "code": "DC", "count": 9 }, { "code": "ED", "count": 3 }, { "code": "MCOD", "count": 3 }]`) y el resumen de calificaciones. **Hallazgo forense clave (`[OBSERVADO]`):** Cada elemento de `summaryMatches` expone las columnas de base de datos `raw_vaep: null`, `offensive_vaep: null`, `defensive_vaep: null` y `xt: null`, probando que la tabla de actuaciones por partido en el backend cuenta con columnas reservadas para modelos **VAEP (Valuing Actions by Estimating Probabilities)** que actualmente se sirven en `null` mientras `skore` lleva la valoración activa:
       ```json
       // Primer elemento de performanceData.summaryMatches en 04b-messi-full-request-45-response.json
       {
         "match_id": "7h0fbff1b3y8k8b9q0efr8s38",
         "date": "2026-03-02Z",
         "timestamp": 1772409600,
         "competition_id": "287tckirbfj9nb8ar2k9r60vn",
         "competition_name": "MLS",
         "season_name": "2026",
         "player_team_id": "7262564v91jr4f82fnx99950b",
         "opponent_id": "9a72432292341242341241241",
         "opponent": "Orlando City",
         "home_team_id": "9a72432292341242341241241",
         "away_team_id": "7262564v91jr4f82fnx99950b",
         "home_score": 2,
         "away_score": 4,
         "minutes_played": 99,
         "raw_vaep": null,
         "offensive_vaep": null,
         "defensive_vaep": null,
         "xt": null,
         "skore": 9.3,
         "position": "Attacking Midfielder",
         "formation_place": "10",
         "side": "Central",
         "role_code": "MO",
         "formation_used": "4231"
       }
       ```
  2. **Lote RPC 2 (`request-47` en Messi · `53,530 B` / `request-46` en Romo · `27,484 B`):**
     - `heatmap-data-updated`: Entrega `{ heatmapPoints: Array<{ x: number, y: number }>, goalmouth: GoalmouthPayload | null, requestId: number }`. En el caso de Lionel Messi (`request-47`), `heatmapPoints` contiene exactamente **`2,000` pares `{x, y}`** en coordenadas Opta $[0, 100] \times [0, 100]$ (revelando el límite máximo `LIMIT 2000` aplicado en backend al muestrear toques de toda la temporada para el KDE de jugador), y `goalmouth: null` (solo poblado cuando el jugador es portero, como se documenta en la Sección 3.5.C y 4.6).

---

### 3.3. Payloads Embebidos de Equipos (`team-america-*.json`, `03-team-*.json` y `03-team.html`) (`[OBSERVADO]`)

- **Evidencia:** [03-team-capture.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/03-team-capture.json) (`ev_aa5f2d74196b21062c132e8b6ec8934f023380f93c40f78f99e333a43bfc9977`), [29-league-tabs-and-team-subtabs-capture.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/29-league-tabs-and-team-subtabs-capture.json) (`ev_a1d8facdf931a87bf33ba5e703e23d73cd2ee0c4550557ba3b84cdb9a1c10088`), y los datasets JSON extraídos en Wave 3:
  - [team-america-profile-percentiles.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/team-america-profile-percentiles.json) (`12,688 B` · métricas de perfil táctico con ranking y percentil de liga).
  - [team-america-54matches-xg-rolling.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/team-america-54matches-xg-rolling.json) (`54` partidos históricos entre `2025/2026` y `2026/2027` con `xg_for`/`xg`, `xg_against`/`xga`, `goals_for`/`goals_against` en `score`, `manager: "André Jardine"`).
  - [team-america-age-profile.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/team-america-age-profile.json) (`4,347 B` · dispersión de edad de plantilla vs `minutes_share` indexada por Opta `personId`).
  - [team-america-attribute-charts.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/team-america-attribute-charts.json) (`120,440 B` · distribución completa de los 171 atributos/traits de equipo).

#### A. Perfil Táctico e Identidad de Juego ([team-america-profile-percentiles.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/team-america-profile-percentiles.json) · `12,688 B` / [03-team-data-team-profile-payload.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/03-team-data-team-profile-payload.json))
Consumido por [team-profile.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/team-profile.js), este payload contiene dos bloques:
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

##### Tabla de los 10 Rasgos de Identidad de Juego (`identity.phases` en [team-america-profile-percentiles.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/team-america-profile-percentiles.json)) (`[OBSERVADO]`)

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

#### B. Serie Histórica Móvil xG vs xGA ([team-america-54matches-xg-rolling.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/team-america-54matches-xg-rolling.json) y [03-team-data-team-xg-rolling-payload.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/03-team-data-team-xg-rolling-payload.json) · `10.9 KB`) (`[OBSERVADO]`)
Generado por `OptaTeamXgTimelineService` y renderizado por [team-xg-rolling.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/team-xg-rolling.js). Contiene **54 partidos históricos consecutivos** de Liga MX (cruzando `2025/2026` y `2026/2027` desde el `11/07/2025` hasta el `08/11/2026`) con `xg` (`xg_for` con 4 decimales en [team-america-54matches-xg-rolling.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/team-america-54matches-xg-rolling.json)), `xga` (`xg_against`), marcador (`score`: `goals_for`-`goals_against`), `manager: "André Jardine"` y media móvil de 5 partidos (`window: 5`, `rolling_xg`, `rolling_xga`):

```json
// Extracto de team-america-54matches-xg-rolling.json (Wave 3 · 54 partidos con precisión de 4 decimales)
{
  "status": "ready",
  "window": 5,
  "matches": 54,
  "first_season": "2025/2026",
  "last": {
    "xg": 2.051,
    "xga": 1.399,
    "diff": 0.652
  },
  "points": [
    {
      "date": "11/07/2025",
      "season": "2025/2026",
      "opponent": "Juárez",
      "home": false,
      "score": "1-1",
      "manager": "André Jardine",
      "xg": 1.0985,
      "xga": 0.4416,
      "rolling_xg": null,
      "rolling_xga": null
    },
    {
      "date": "07/11/2026",
      "season": "2026/2027",
      "opponent": "Pumas UNAM",
      "home": false,
      "score": "2-2",
      "manager": "André Jardine",
      "xg": 1.8295,
      "xga": 1.5681,
      "rolling_xg": 2.051,
      "rolling_xga": 1.399
    }
  ]
}
```

---

#### C. Perfil de Edad de la Plantilla ([team-america-age-profile.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/team-america-age-profile.json) · `4,347 B` / [03-team-data-team-age-profile-payload.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/03-team-data-team-age-profile-payload.json)) (`[OBSERVADO]`)
Consumido por [team-age-profile.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/team-age-profile.js). Incluye los **36 jugadores registrados en la plantilla de Club América** indexados por su UUID Opta (`id` / `personId`), edad (`age`), minutos jugados (`minutes` sobre `max_minutes: 1440` de `played: 16` partidos), cuota de minutos (`minutes_share`), código de posición (`DMF`, `CF`, `RB`, `LB`, `LWF`, `GK`, `CB`, `RWF`, `AMF`, `CMF`) y la banda de edad pico (`prime_min: 24, prime_max: 29`):

```json
// Extracto de team-america-age-profile.json (4,347 B)
{
  "available": true,
  "players": [
    {
      "id": "54kcu71vtiz8xlkke60k394a1",
      "name": "É. Sánchez",
      "age": 27,
      "minutes": 1113,
      "minutes_share": 77.3,
      "position": "DMF"
    },
    {
      "id": "5ysw10inm8syf7r9xvbpk9n11",
      "name": "H. Martín",
      "age": 33,
      "minutes": 1110,
      "minutes_share": 77.1,
      "position": "CF"
    },
    {
      "id": "csvbc0k1f54418nn8pjhg8ull",
      "name": "C. Borja",
      "age": 33,
      "minutes": 818,
      "minutes_share": 56.8,
      "position": "LB"
    },
    {
      "id": "claujooxyw4dzynzmy752r3l5",
      "name": "S. Cáceres",
      "age": 27,
      "minutes": 180,
      "minutes_share": 12.5,
      "position": "CB"
    }
  ],
  "reference": {
    "played": 16,
    "max_minutes": 1440,
    "prime_min": 24,
    "prime_max": 29
  },
  "empty_message": null
}
```

---

#### D. Perfil de Formación (`loadTeamFormationProfile`), Red de Pases y Matriz de Pases ([03b-team-full-request-46-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/03b-team-full-request-46-response.json), [team-formation-profile.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/team-formation-profile.js) y [team-pass-network.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/team-pass-network.js)) (`[OBSERVADO]`)

1. **Contrato RPC `loadTeamFormationProfile(requestId)` $\rightarrow$ evento `team-formation-profile-updated` ([03b-team-full-request-46-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/03b-team-full-request-46-response.json) · `111,086 B`, `ev_8b664e194ac67d05a98289a150adcb3f310fb2622bcc70a084ab5c7d978cb365`) (`[OBSERVADO]`):**
   - Al montar el perfil de equipo (`/team/club-america-eu8c408f59yx7egaqossbv25e`), el bloque estático `03-team-data-team-formation-profile-payload.json` arranca vacío (`{"available":false,"most_used":null,"formations":[]}`) y el cliente dispara inmediatamente la llamada Livewire `TeamDetail::loadTeamFormationProfile(1)`, que devuelve el perfil táctico completo tanto en `snapshot.data.formationProfile` como en el evento despachado `team-formation-profile-updated` (`params.payload`), consumido por [team-formation-profile.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/team-formation-profile.js) (líneas 1–93).
   - **Esquema TypeScript `[OBSERVADO]` de `formationProfile`:**
     ```typescript
     interface TeamFormationProfilePayload {
       available: boolean;
       most_used: FormationEntry | null; // Formación principal (mayor cantidad de minutos/partidos)
       formations: FormationEntry[];     // Todas las formaciones empleadas en el torneo (ordenadas por uso)
       coverage: {
         total_matches: number;          // Ej. 16 en Liga MX Apertura 2026/2027
         analysed_matches: number;       // Ej. 16
         complete: boolean;              // true si analysed_matches === total_matches
       };
       budget_truncated: boolean;        // Control de presupuesto de tiempo/memoria en servidor
       empty_message: string | null;
     }

     interface FormationEntry {
       formation: string;                // Etiqueta separada por guiones (ej. "4-2-3-1", "4-4-2")
       matches: number;                  // Partidos donde fue la formación principal (ej. 14 de 16)
       minutes: number;                  // Minutos jugados con esta formación (ej. 1260 min)
       total_matches: number;            // Total de partidos del torneo (16)
       analysed_matches: number;         // Partidos analizados (16)
       share: number;                    // Porcentaje de uso (ej. 87.5 para 14/16, 12.5 para 2/16)
       match_ids: string[];              // UUIDs Opta de los partidos en que se usó esta formación
       lineups_by_match: Record<string, Record<string, FormationPlayerSlot>>; // [match_id][player_id]
     }

     interface FormationPlayerSlot {
       player_id: string;                // UUID Opta del jugador (25 chars base-36)
       name: string;                     // Nombre completo en Opta
       position: "Goalkeeper" | "Defender" | "Midfielder" | "Striker" | "Attacking Midfielder" | "Defensive Midfielder" | "Wing Back" | "Substitute";
       side: "Centre" | "Left" | "Right" | "Centre/Right" | "Centre/Left" | "";
       formation_place: string;          // "1".."11" para los 11 titulares (estándar Opta F9); "" para suplentes
       x: number;                        // Coordenada táctica longitudinal Opta [0, 100] (0 para banca)
       y: number;                        // Coordenada táctica transversal Opta [0, 100] (0 para banca)
     }
     ```
   - **Lógica de agregación de los 11 slots en cliente ([team-formation-profile.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/team-formation-profile.js) líneas 46–91) (`[OBSERVADO]`):**
     El frontend no recibe los 11 nodos pre-promediados, sino el diccionario crudo `lineups_by_match` de los 16 partidos (`111 KB`), y ejecuta `aggregateFormation(formationEntry)` en el navegador:
     1. Itera sobre `formationEntry.match_ids` y filtra únicamente los jugadores titulares (`Number(slot.formation_place) >= 1 && <= 11`, descartando `position === "Substitute"`).
     2. Agrupa por número de slot táctico Opta (`slot = 1..11`), acumulando para cada `slot` las coordenadas `sumX`, `sumY`, `count` y el mapa de jugadores que ocuparon ese slot (`slotEntry.players.get(playerId)`).
     3. Calcula la coordenada media del slot (`x = sumX / count`, `y = sumY / count`) y selecciona como titular representativo (`primaryPlayer`) al jugador con mayor número de apariciones (`appearances`) en ese `formation_place`, mostrándolo en el nodo de la cancha junto con los demás jugadores que rotaron en esa posición (`otherPlayers`).
   - **Payload Real Capturado en [03b-team-full-request-46-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/03b-team-full-request-46-response.json) (Club América · Apertura 2026/2027) (`[OBSERVADO]`):**
     ```json
     {
       "available": true,
       "most_used": {
         "formation": "4-2-3-1",
         "matches": 14,
         "minutes": 1260,
         "total_matches": 16,
         "analysed_matches": 16,
         "share": 87.5,
         "match_ids": [
           "9dy7dhz5f13b2ejz2a5tok2l0",
           "9ch2e8e2kuxv9u2s24m8k12cc"
         ],
         "lineups_by_match": {
           "9dy7dhz5f13b2ejz2a5tok2l0": {
             "a1qs3b34p5u2s6mmlhdkgdp7t": {
               "player_id": "a1qs3b34p5u2s6mmlhdkgdp7t",
               "name": "Luis Ángel Malagón Velázquez",
               "position": "Goalkeeper",
               "side": "Centre",
               "formation_place": "1",
               "x": 9,
               "y": 50
             },
             "2efu9mmb5p4n6tkbqcfstjypx": {
               "player_id": "2efu9mmb5p4n6tkbqcfstjypx",
               "name": "Kevin Nahin Álvarez Campos",
               "position": "Defender",
               "side": "Right",
               "formation_place": "2",
               "x": 28,
               "y": 15
             },
             "54kcu71vtiz8xlkke60k394a1": {
               "player_id": "54kcu71vtiz8xlkke60k394a1",
               "name": "Érick Daniel Sánchez Ocegueda",
               "position": "Attacking Midfielder",
               "side": "Centre",
               "formation_place": "10",
               "x": 66,
               "y": 50
             },
             "5ysw10inm8syf7r9xvbpk9n11": {
               "player_id": "5ysw10inm8syf7r9xvbpk9n11",
               "name": "Henry Josué Martín Mex",
               "position": "Striker",
               "side": "Centre",
               "formation_place": "9",
               "x": 82,
               "y": 50
             }
           }
         }
       },
       "formations": [
         { "formation": "4-2-3-1", "matches": 14, "minutes": 1260, "total_matches": 16, "analysed_matches": 16, "share": 87.5 },
         { "formation": "4-4-2", "matches": 2, "minutes": 180, "total_matches": 16, "analysed_matches": 16, "share": 12.5 }
       ],
       "coverage": {
         "total_matches": 16,
         "analysed_matches": 16,
         "complete": true
       },
       "budget_truncated": false,
       "empty_message": null
     }
     ```

2. **Red de Pases (`data-team-pass-network-payload` / `team-pass-network.js`) y Matriz de Pases (`data-team-pass-matrix-table`):** (`[OBSERVADO]` en [team-pass-network.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/team-pass-network.js) líneas 1–420)
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

### 3.4. Payloads de Jugadores, Mapas de Eventos, Jugadores Similares, Comparador y Búsqueda Avanzada de Scouting (`[OBSERVADO]`)

- **Evidencia:** [04-player-data-bootstrap.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/04-player-data-bootstrap.json) (`15.7 KB`, `ev_59e57f74d8e4894a8c290cd1f58354701d398bea6301f1cdfe07edeeef89f945`), [26-player-rpc-full-capture.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/26-player-rpc-full-capture.json) (`ev_41b5aea353de3d177450dcde63cb0d0667428ca0f57851df7edfd18049e9319c`), [27-goalkeeper-rpc-capture.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/27-goalkeeper-rpc-capture.json) (`ev_fe42082ccfb04731fd689598d84d1596a35361d94ca19ba7707e87a1c1fc8ab0`), [07-players.html](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/07-players.html), [19b-players-teams-tab-wait-apply-teams.html](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/19b-players-teams-tab-wait-apply-teams.html) y [event-map.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/event-map.js).

#### A. Bootstrap del Mapa de Eventos de Jugador (`04-player-data-bootstrap.json`) (`[OBSERVADO]`)
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
> En cuenta gratuita (`Scout`), el evento raíz de cada familia (ej. `involvement`, `shots_all`, `pass_open_play`, `progression_all`, `creation_all`, `duels_all`, `dribbles_all`, `off_ball_all`) está desbloqueado ("Con la cuenta gratuita tienes un evento por sección"), mientras que los sub-filtros específicos (`locked: true` en `availableEvents`) muestran candado en la UI. No obstante, como demuestra la auditoría RPC en `26-player-rpc-full-request-65/66-response.json`, el método público `PlayerDetail::loadMapGraphData` en el servidor **no bloquea la ejecución** cuando se invoca con `shots_xg` o `pass_progressive`, devolviendo el payload completo de puntos Opta.

#### B. Contratos RPC `loadMapGraphFilterOptions` y `loadMapGraphData` (`OptaEventMapBuilder` $\rightarrow$ `event-map.js`) (`[OBSERVADO]`)

- **Evidencia:** Capturas en vivo sobre Luis Romo (`1cyhpfi77dom7gmpuownxlcrt`, `ev_41b5aea353de3d177450dcde63cb0d0667428ca0f57851df7edfd18049e9319c`):
  - [26-player-rpc-full-request-63-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/26-player-rpc-full-request-63-response.json) (`204,688 B`): `loadMapGraphFilterOptions(["9zum4nxferygj8bb0ldcavxn8", "player-detail-map-filters-1"])` $\rightarrow$ evento `player-map-graph-filter-options-updated`.
  - [26-player-rpc-full-request-64-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/26-player-rpc-full-request-64-response.json) (`268,677 B`): `loadMapGraphData("involvement", "scatterplot", { clusters: 3, removeOutliers: true, variant: "all" }, filters, "rpc-map-1")` $\rightarrow$ evento `player-map-graph-data-updated`.
  - [26-player-rpc-full-request-65-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/26-player-rpc-full-request-65-response.json) (`225,134 B`): `loadMapGraphData("shots_xg", "scatterplot", { clusters: 3, removeOutliers: true, variant: "all" }, filters, "rpc-map-2")`.
  - [26-player-rpc-full-request-66-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/26-player-rpc-full-request-66-response.json) (`233,554 B`): `loadMapGraphData("pass_progressive", "scatterplot", { clusters: 3, removeOutliers: true, variant: "all" }, filters, "rpc-map-3")`.

1. **Árbol de Filtros (`loadMapGraphFilterOptions` en [26-player-rpc-full-request-63-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/26-player-rpc-full-request-63-response.json)) (`[OBSERVADO]`):**
   Despacha `player-map-graph-filter-options-updated` con el objeto `mapGraphFilters`:
   ```json
   {
     "scopeOptions": [
       { "key": "season", "label": "Temporada" },
       { "key": "match", "label": "Partido" }
     ],
     "contextOptions": [
       {
         "key": "9zum4nxferygj8bb0ldcavxn8",
         "tmcl": "9zum4nxferygj8bb0ldcavxn8",
         "competition_id": "2hsidwomhjsaaytdy9u5niyi4",
         "league_name": "Liga MX",
         "season_label": "2026/2027",
         "label": "Liga MX · 2026/2027",
         "short_label": "2026/2027",
         "matches": 12
       }
     ],
     "tournamentOptions": [
       { "key": "apertura", "label": "Apertura", "matches": 12 }
     ],
     "matchOptions": [
       {
         "id": "9enz9ejz74zc2m07mw8rnq044",
         "label": "Guadalajara 2 - 0 Tijuana",
         "meta": "7 nov 2026 · Liga MX",
         "date": "2026-11-07",
         "display": "Guadalajara 2 - 0 Tijuana · 7 nov 2026"
       }
     ],
     "defaults": {
       "scope": "match",
       "contextKey": "9zum4nxferygj8bb0ldcavxn8",
       "seasonKey": "9zum4nxferygj8bb0ldcavxn8",
       "tournamentKey": "apertura",
       "matchId": "9enz9ejz74zc2m07mw8rnq044",
       "matchIds": ["9enz9ejz74zc2m07mw8rnq044"]
     },
     "requestId": "player-detail-map-filters-1"
   }
   ```

2. **Esquema TypeScript `[OBSERVADO]` de `loadMapGraphData` (`player-map-graph-data-updated`):**
   ```typescript
   interface PlayerMapGraphDataPayload {
     eventKey: string;              // Ej. "involvement" | "shots_xg" | "pass_progressive"
     eventLabel: string;            // Ej. "Involucramiento" | "Mapa xG" | "Pases progresivos"
     sectionLabel: string;          // Ej. "Involucramiento" | "Tiros" | "Pases"
     sourceEvent: string;           // Evento fuente interno
     viewKey: "scatterplot" | "heatmap" | "zone_control" | "territories";
     viewLabel: string;             // Ej. "Mapa de eventos"
     variantKey: string;            // Ej. "all" | "successful" | "unsuccessful"
     variants: Record<string, string>;
     kind: "point" | "shot" | "pass" | "hull"; // Determina el renderer en event-map.js
     subject: "player" | "team";
     side: "for" | "against";
     availableEvents: Array<{       // Catálogo completo de 29 eventos con conteos en vivo
       locked: boolean;
       key: string;
       label: string;
       section: string;
       views: string[];             // Ej. ["scatterplot", "heatmap", "zone_control"]
       outcomes: Record<string, string>;
       hasClusterOptions: boolean;  // true en los 6 eventos de la sección "Pases"
       count: number;               // Conteo en el partido/filtro activo
       seasonCount: number;         // Conteo acumulado en toda la temporada
     }>;
     seasonAvailableEvents: Array<any>;
     points: MapEventPoint[];       // Eventos del alcance activo (partido o temporada)
     seasonPoints: MapEventPoint[]; // Eventos de respaldo de la temporada
     zones: any | null;             // Grilla de OptaZoneControl cuando viewKey === "zone_control"
     hulls: any[];                  // Polígonos convexos (convex hulls) cuando kind === "hull"
     legend: Array<{ key: string; label: string; color: string }>;
     clusters: {
       enabled: boolean;            // true en eventos de pase ("kind": "pass")
       count: 2 | 3 | 6;            // Número de clusters K-Means solicitado (default: 3)
       removeOutliers: boolean;     // Filtro "Filtrar pases poco comunes"
     };
     summary: Record<string, number | boolean>; // Generado por OptaEventMapBuilder::summary()
     emptyMessage: string | null;
     filters: {
       scope: "match" | "season";
       contextKey: string;
       seasonKey: string;
       tournamentKey: string;
       matchId: string;
       matchIds: string[];
       playerId: string;
       side: "for" | "against";
     };
     requestId: string;
   }
   ```

3. **Variantes Exactas de `points[]` y `summary` en las 3 Capturas RPC (`request-64`, `request-65`, `request-66`) (`[OBSERVADO]`):**
   - **Caso 1 — `involvement` (`kind: "point"`, [26-player-rpc-full-request-64-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/26-player-rpc-full-request-64-response.json), `105` eventos en el partido Guadalajara 2-0 Tijuana y `1,208` en el Apertura):**
     Cada punto expone el **`raw_event_id` entero original del feed F24/MAT de Opta** (ej. `2995900373`) y el **`type_primary` con el `typeId` estándar de Opta** (`"1"` = Pass, `"12"` = Clearance, `"15"` = Attempt Saved/Blocked, `"49"` = Ball Recovery, etc.):
     ```json
     // points[0] y summary en 26-player-rpc-full-request-64-response.json (involvement)
     {
       "point": {
         "match_id": "9enz9ejz74zc2m07mw8rnq044",
         "match_label": "Guadalajara 2 - 0 Tijuana",
         "match_meta": "7 nov 2026 · Liga MX",
         "match_date": "2026-11-07",
         "match_display": "Guadalajara 2 - 0 Tijuana · 7 nov 2026",
         "minute": 0,
         "second": 22,
         "x": 38.6,
         "y": 54.4,
         "label": "Pase",
         "type_primary": "1",
         "type_secondary": "Pase",
         "event_name": "Pase",
         "outcome": "1",
         "outcome_label": "Exitoso",
         "raw_event_id": 2995900373
       },
       "summary": {
         "total": 105
       }
     }
     ```
   - **Caso 2 — `shots_xg` (`kind: "shot"`, [26-player-rpc-full-request-65-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/26-player-rpc-full-request-65-response.json), `1` tiro en el partido y `5` en el torneo):**
     Añade `goal`, `xg` (redondeado a 4 decimales), `weight` (valor flotante de doble precisión del modelo Opta xG: `0.015825660899281502`), `body_part` (`"right"` | `"left"` | `"head"`), `on_target` y `penalty`:
     ```json
     // points[0] y summary en 26-player-rpc-full-request-65-response.json (shots_xg)
     {
       "point": {
         "match_id": "9enz9ejz74zc2m07mw8rnq044",
         "match_label": "Guadalajara 2 - 0 Tijuana",
         "match_meta": "7 nov 2026 · Liga MX",
         "match_date": "2026-11-07",
         "match_display": "Guadalajara 2 - 0 Tijuana · 7 nov 2026",
         "minute": 53,
         "second": 46,
         "x": 75.5,
         "y": 32.1,
         "label": "Remate bloqueado",
         "type_primary": "15",
         "type_secondary": "Remate bloqueado",
         "event_name": "Remate bloqueado",
         "outcome": "1",
         "outcome_label": "Remate bloqueado",
         "raw_event_id": 2995971849,
         "goal": false,
         "xg": 0.0158,
         "weight": 0.015825660899281502,
         "body_part": "right",
         "on_target": false,
         "penalty": false
       },
       "summary": {
         "total": 1,
         "goals": 0,
         "total_xg": 0.016,
         "xg_per_shot": 0.016,
         "xg_reliable": true
       }
     }
     ```
   - **Caso 3 — `pass_progressive` (`kind: "pass"`, [26-player-rpc-full-request-66-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/26-player-rpc-full-request-66-response.json), `17` pases progresivos en el partido y `177` en el torneo):**
     Añade `end_x`, `end_y`, `accurate` (`boolean`), `length` (longitud euclidiana proyectada en metros), `progressive` (`boolean`), `into_box` (`boolean`), `xt`, y habilita `clusters: { enabled: true, count: 3, removeOutliers: true }`:
     ```json
     // points[0], clusters y summary en 26-player-rpc-full-request-66-response.json (pass_progressive)
     {
       "point": {
         "match_id": "9enz9ejz74zc2m07mw8rnq044",
         "match_label": "Guadalajara 2 - 0 Tijuana",
         "match_meta": "7 nov 2026 · Liga MX",
         "match_date": "2026-11-07",
         "match_display": "Guadalajara 2 - 0 Tijuana · 7 nov 2026",
         "minute": 4,
         "second": 57,
         "x": 27.6,
         "y": 54.4,
         "label": "Pase",
         "type_primary": "1",
         "type_secondary": "Pase",
         "event_name": "Pase",
         "outcome": "0",
         "outcome_label": "Fallido",
         "raw_event_id": 2995906651,
         "end_x": 86.6,
         "end_y": 34.8,
         "accurate": false,
         "length": 63.5,
         "progressive": true,
         "into_box": true,
         "xt": null
       },
       "clusters": {
         "enabled": true,
         "count": 3,
         "removeOutliers": true
       },
       "summary": {
         "total": 17,
         "success_rate": 52.9
       }
     }
     ```

#### C. Motor RPC de Jugadores Similares (`loadSimilarPlayersData([])`) (`[OBSERVADO]`)

- **Evidencia:**
  - Jugador de campo (`CB` · Luis Romo): [26-player-rpc-full-request-52-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/26-player-rpc-full-request-52-response.json) (`19,995 B`, `ev_41b5aea353de3d177450dcde63cb0d0667428ca0f57851df7edfd18049e9319c`).
  - Portero (`GK` · Luis Malagón): [27-goalkeeper-rpc-request-52-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/27-goalkeeper-rpc-request-52-response.json) (`19,975 B`, `ev_fe42082ccfb04731fd689598d84d1596a35361d94ca19ba7707e87a1c1fc8ab0`).
- **Mecanismo y Reglas de Negocio Observadas (`[OBSERVADO]`):**
  Cuando el usuario abre la pestaña `Similares` (o se invoca `$wire.loadSimilarPlayersData()`), el componente PHP `PlayerDetail::loadSimilarPlayersData()` devuelve en `effects.returns[0]` (y sincroniza en `snapshot.data.similarPlayersData`) el ranking de similitud estilística:
  1. **Universo y Umbral de Minutos:** Evalúa candidatos de todas las 40 ligas (`filters.scope = "all"`) dentro del mismo macro-grupo posicional (`subject.group = "CB"` para Defensa central con **`total: 3,127`** candidatos evaluados y `minutes_ceiling: 4300`; `subject.group = "GK"` para Portero con **`total: 1,228`** candidatos evaluados y `minutes_ceiling: 4450`), exigiendo por defecto **`min_minutes: 450`**.
  2. **Recorte de Paywall (`shown: 3`, `locked: 17`):** El motor selecciona el Top 20 de jugadores más parecidos del mundo, pero en el plan gratuito (`Scout`) **envía en el arreglo `players` únicamente los 3 primeros candidatos (`shown: 3`)** y reporta `locked: 17` para los puestos 4 al 20. Además, si un candidato del Top 3 pertenece a una de las 31 ligas bloqueadas (ej. `L. Spatz` en Regionalliga / 2. Bundesliga o `L. Ayling` en Championship), marca `"compare_locked": true` para impedir abrirlo en el comparador directo sin suscripción `Plus`.
  3. **Puntuación (`similarity`), Banda (`band`) y Explicabilidad (`reasons`):**
     - `similarity`: Entero en escala `0..100` (ej. `92` para Alex Roldan, `91` para Lukas Spatz y Luke Ayling respecto a Luis Romo; `87` para Christopher Rodas, `79` para Eder Lima y `77` para Maxime Delanghe respecto a Luis Malagón).
     - `band`: Clasificación semántica de similitud (`"Muy parecido"` cuando `similarity >= 85`, `"Parecido"` cuando `similarity < 85`).
     - `reasons`: Arreglo de exactamente **3 cadenas en español** generadas en backend que explican las mayores diferencias direccionales (`"más ..."` / `"menos ..."`) entre el candidato y el jugador sujeto (ej. `["más xT por pases", "más pérdidas de balón", "más pases progresivos exitosos"]`).

##### Esquema TypeScript y Payload Real Capturado (`26-player-rpc-full-request-52-response.json` y `27-goalkeeper-rpc-request-52-response.json`) (`[OBSERVADO]`)
```typescript
interface SimilarPlayersDataPayload {
  status: "ready" | "empty";
  filters: {
    scope: "all" | "same_league" | "top_leagues";
    age_min: number | null;
    age_max: number | null;
    min_minutes: number;      // Default: 450
    min_skore: number | null;
  };
  subject: {
    player_id: string;        // UUID Opta del jugador evaluado
    name: string;
    team_name: string;
    group: "CB" | "FB" | "DM" | "CM" | "AM" | "W" | "FW" | "GK"; // Macro-grupo de similitud
    group_label: string;      // Ej. "Defensa central", "Portero"
    league_label: string;
    region: string;           // Ej. "Mexico"
    season_label: string;     // Ej. "2026/2027"
    previous_season: boolean; // true si usó fallback a la temporada anterior por <450 min
    pooled: boolean;
    minutes: number;          // Ej. 1054 (Romo), 540 (Malagón)
    skore: number;            // Ej. 7.43 (Romo), 6.46 (Malagón)
  };
  players: Array<{
    player_id: string;
    url: string;
    name: string;
    image: string | null;
    team_id: string;
    team_name: string;
    team_image: string | null;
    competition_name: string;
    competition_id: string;
    alpha2: string;           // Código ISO-2 de bandera de la liga (ej. "us", "de", "gb-eng")
    season_label: string;
    previous_season: boolean;
    age: number;
    minutes: number;
    similarity: number;       // Score [0..100] (ej. 92, 91, 87)
    band: "Muy parecido" | "Parecido";
    reasons: [string, string, string]; // 3 diferencias clave generadas por el motor
    skore: number;
    compare_locked: boolean;  // true si la liga del candidato requiere plan Plus
  }>;
  total: number;              // Tamaño del universo evaluado (3127 en CB, 1228 en GK)
  shown: number;              // Candidatos entregados al cliente (3 en plan Scout)
  locked: number;             // Candidatos ocultos tras paywall (17 en plan Scout)
  minutes_ceiling: number;    // Techo del slider de minutos (4300 en CB, 4450 en GK)
  message: string | null;
}
```
```json
// Extracto de effects.returns[0] en 26-player-rpc-full-request-52-response.json (Luis Romo · CB)
{
  "status": "ready",
  "filters": { "scope": "all", "age_min": null, "age_max": null, "min_minutes": 450, "min_skore": null },
  "subject": {
    "player_id": "1cyhpfi77dom7gmpuownxlcrt",
    "name": "L. Romo",
    "team_name": "Guadalajara",
    "group": "CB",
    "group_label": "Defensa central",
    "league_label": "Liga MX",
    "region": "Mexico",
    "season_label": "2026/2027",
    "previous_season": false,
    "pooled": false,
    "minutes": 1054,
    "skore": 7.43
  },
  "players": [
    {
      "player_id": "4c425g0508s29v6r0b0c9w791",
      "url": "https://www.statiskicks.com/player/4c425g0508s29v6r0b0c9w791/alex-roldan",
      "name": "A. Roldan",
      "image": "https://media.api-sports.io/football/players/50853.png",
      "team_id": "2a85g3b5c1m0p2q4r6s8t0u2v",
      "team_name": "Seattle Sounders",
      "team_image": "https://www.statiskicks.com/storage/media/teams/1595.png",
      "competition_name": "MLS",
      "competition_id": "287tckirbfj9nb8ar2k9r60vn",
      "alpha2": "us",
      "season_label": "2026",
      "previous_season": false,
      "age": 30,
      "minutes": 2196,
      "similarity": 92,
      "band": "Muy parecido",
      "reasons": [
        "más xT por pases",
        "más pérdidas de balón",
        "más pases progresivos exitosos"
      ],
      "skore": 7.21,
      "compare_locked": false
    },
    {
      "player_id": "7x8y9z0a1b2c3d4e5f6g7h8i9",
      "url": "https://www.statiskicks.com/player/7x8y9z0a1b2c3d4e5f6g7h8i9/luke-ayling",
      "name": "L. Ayling",
      "image": "https://media.api-sports.io/football/players/19118.png",
      "team_name": "Middlesbrough",
      "competition_name": "Championship",
      "competition_id": "7ntvbsyq31jnzoqoa8850b9b8",
      "alpha2": "gb-eng",
      "season_label": "2026/2027",
      "previous_season": false,
      "age": 35,
      "minutes": 1244,
      "similarity": 91,
      "band": "Muy parecido",
      "reasons": [
        "más pases progresivos exitosos",
        "más pases largos exitosos",
        "más conducciones progresivas"
      ],
      "skore": 7.13,
      "compare_locked": true
    }
  ],
  "total": 3127,
  "shown": 3,
  "locked": 17,
  "minutes_ceiling": 4300,
  "message": null
}
```

#### D. Motor RPC de Comparación de Jugadores (`ensureComparisonDataLoaded([])`) ([26-player-rpc-full-request-62-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/26-player-rpc-full-request-62-response.json) · `333,205 B` & [30-player-tabs-compare-desempeno-modals-request-62-request.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/30-player-tabs-compare-desempeno-modals-request-62-request.json)) (`[OBSERVADO]`)

- **Evidencia:**
  1. [26-player-rpc-full-request-62-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/26-player-rpc-full-request-62-response.json) (`333,205 B`, `ev_41b5aea353de3d177450dcde63cb0d0667428ca0f57851df7edfd18049e9319c`) sobre Luis Romo (`1cyhpfi77dom7gmpuownxlcrt`, Liga MX `9zum4nxferygj8bb0ldcavxn8`).
  2. **Wave 3 (`ev_9435086f6ae02ff0707fefa83c7cf473eda660deed890524e621cb9825c97446`):** [30-player-tabs-compare-desempeno-modals-request-62-request.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/30-player-tabs-compare-desempeno-modals-request-62-request.json) sobre Lionel Messi (`c5ryhn04g9goikd0blmh83aol`, Inter Miami CF `7329459`, MLS `selectedSeasonId: "6i6n0jkbh9zzij6s8htfjh2j8"`, `selectedStageFilter: "STAGE_74623a6zmmk15vosebdok4kr8"`), cuyo `snapshot` expone los **80 calendarios `seasonOptions` Opta `tmcl`** en los que el jugador tiene registros históricos, seguido de la búsqueda de segundo jugador vía `GET /players/search?q=Luis` ([30-player-tabs-compare-desempeno-modals-request-63-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/30-player-tabs-compare-desempeno-modals-request-63-response.json)).
  3. **Consumidor JS:** `playerComparison()` en [attribute-charts.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/attribute-charts.js).
- **Arquitectura del Paquete de Comparación (`333 KB`):**
  Al abrir la pestaña `Comparar`, el cliente invoca `\$wire.ensureComparisonDataLoaded()`, que retorna en `effects.returns[0]` (e hidrata en `snapshot.data.comparisonData`) el objeto `{ players: ComparisonPlayerBundle[], error: string | null }`. Cada paquete `ComparisonPlayerBundle` empaqueta en una sola estructura auto-contenida:
  1. **Metadatos completos del jugador y contexto competitivo:** `id`, `name`, `team_id`, `team_name`, `league_name`, `league_logo`, `season_label`, `tmcl` (`"9zum4nxferygj8bb0ldcavxn8"`), `position` (`"LCB"`), `needs_position` (`false`), `age` (`31`), `nationality` (`"Mexico"`), `flag`, `image`, `url`.
  2. **Catálogo íntegro de `traits` (147 objetos `TraitItem` para jugador de campo / 176 para portero):** Incluye tanto los valores por 90 minutos (`val`, `raw_value`, `benchmark`, `percentile`, `population_average`, `min_range`, `max_range`, `rank`, `rank_total`) como el sub-objeto `total` acumulado y los stops de `bar_gradient`.
  3. **Nube completa de coordenadas `heatmap` (`1,309` puntos `{x, y}` para Luis Romo):** Permite a `playerComparison()` renderizar lado a lado los radares superpuestos, las barras de percentiles comparativas y los mapas de calor KDE de ambos jugadores sin disparar peticiones adicionales al cambiar de métrica.

```json
// Extracto de effects.returns[0] en 26-player-rpc-full-request-62-response.json (333,205 B)
{
  "players": [
    {
      "id": "1cyhpfi77dom7gmpuownxlcrt",
      "name": "L. Romo",
      "team_id": "e603sojy77s4u0ypqds2v2a1g",
      "team_name": "Guadalajara",
      "league_name": "Liga MX",
      "league_logo": "https://www.statiskicks.com/storage/media/leagues/262.png",
      "season_label": "2026/2027",
      "tmcl": "9zum4nxferygj8bb0ldcavxn8",
      "position": "LCB",
      "needs_position": false,
      "age": 31,
      "nationality": "Mexico",
      "flag": "https://flagcdn.com/w20/mx.png",
      "image": "https://media.api-sports.io/football/players/35970.png",
      "url": "https://www.statiskicks.com/player/1cyhpfi77dom7gmpuownxlcrt/luis-romo",
      "traits": [
        {
          "key": "forward_passes",
          "label": "Pases hacia adelante",
          "raw_name": "Forward Passes",
          "val": 33.47,
          "raw_value": 33.47,
          "benchmark": 33.47,
          "percentile": 100,
          "population_average": 18.08,
          "min_range": 7.64,
          "max_range": 33.47,
          "category": "Pase",
          "defaultVisible": true,
          "lowerIsBetter": false,
          "unit": "per_90",
          "rank": 1,
          "rank_total": 76,
          "total": { "val": 392, "percentile": 98.67, "population_average": 173.96, "rank": 2, "rank_total": 76 }
        }
      ],
      "heatmap": [
        { "x": 38.6, "y": 54.4 },
        { "x": 27.6, "y": 54.4 }
      ]
    }
  ],
  "error": null
}
```

#### E. Búsqueda Avanzada de Scouting (`/players`): Modo `Jugadores`, Modo `Equipos` y RPCs `statRanges` + `periodCalendar` (`[OBSERVADO]`)

- **Evidencia:** [07-players.html](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/07-players.html) (`ev_e97046d53210bf233f1dc576a689f77283053071ff3e34bcc5c159f70a48d467`), [players-filter-draft-config.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/players-filter-draft-config.json) (`67,924 B`), [rosetta-177-opta-attributes-catalog.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/rosetta-177-opta-attributes-catalog.json) (`39,144 B`), [07-players-wire-script-0.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/inline-pages/07-players-wire-script-0.js), [31-players-statranges-and-matches-hub-capture.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/31-players-statranges-and-matches-hub-capture.json) (`ev_04b1ede55ec1bd3f547cd81c48dc5a1fc2e4e8b8f9a9020481a3e35092a126e8`), [31-players-statranges-and-matches-hub-request-40-request.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/31-players-statranges-and-matches-hub-request-40-request.json), [31-players-statranges-and-matches-hub-request-40-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/31-players-statranges-and-matches-hub-request-40-response.json), [31-players-statranges-and-matches-hub-request-42-request.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/31-players-statranges-and-matches-hub-request-42-request.json), [31-players-statranges-and-matches-hub-request-42-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/31-players-statranges-and-matches-hub-request-42-response.json), [19-players-explorer-and-teams-tab-capture.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/19-players-explorer-and-teams-tab-capture.json) (`ev_ee1b824445ea515e9b3e77beab6b26944bada18d1da9672c4e24e67a44959dfc`), [19b-players-teams-tab-wait-apply-teams.html](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/19b-players-teams-tab-wait-apply-teams.html) (`ev_6b549dd49e412ea51ee2493cc932cd8e19fdd6c66225d9b2e9486215bf236a16`) y [19b-players-teams-tab-request-43-request.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/19b-players-teams-tab-request-43-request.json).

1. **Modo `Jugadores` (`tab = "players"` en [07-players.html](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/07-players.html) y [players-filter-draft-config.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/players-filter-draft-config.json)) (`[OBSERVADO]`):**
   - **Payload de inicialización `playersFilterDraft` ([players-filter-draft-config.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/players-filter-draft-config.json) · `67,924 B`):** Hidrata el estado reactivo de Alpine en `/players` con `defaultLeagueId: "2hsidwomhjsaaytdy9u5niyi4"`, `leagueSeasonCoverage` para las 9 ligas desbloqueadas, `leagueCatalog` de las 40 competiciones (31 bloqueadas), `nationalities` (`115` países con bandera FlagCDN), `positions` (`14` posiciones tácticas) y `statCatalog` (`177` atributos en `13` categorías, consolidados también en [rosetta-177-opta-attributes-catalog.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/rosetta-177-opta-attributes-catalog.json)).
   - **Taxonomía de 14 Posiciones Tácticas (y 20 sub-roles con lateralidad en `04-player.html`):**
     - En `07-players.html` (selector de cancha SVG): `POR` (Portero), `DFC` (Defensa central), `LI` (Lateral izquierdo), `LD` (Lateral derecho), `CAI` (Carrilero izquierdo), `CAD` (Carrilero derecho), `MCD` (Mediocentro defensivo), `MC` (Mediocentro), `MCO` (Mediocentro ofensivo), `VI` (Volante izquierdo), `VD` (Volante derecho), `EI` (Extremo izquierdo), `ED` (Extremo derecho), `DC` (Delantero centro).
     - En `04-player.html` (mapa de apariciones del jugador) se añaden los sub-roles con perfil izquierdo/derecho: `DFCI`, `DFCD`, `MCDI`, `MCDD`, `INI`, `IND` (Interiores), `MCOI`, `MCOD`.
   - **RPC de Rangos Dinámicos (`Players::statRanges` en [31-players-statranges-and-matches-hub-request-40-request.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/31-players-statranges-and-matches-hub-request-40-request.json) y [31-players-statranges-and-matches-hub-request-40-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/31-players-statranges-and-matches-hub-request-40-response.json), `ev_04b1ede55ec1bd3f547cd81c48dc5a1fc2e4e8b8f9a9020481a3e35092a126e8`) (`[OBSERVADO]`):**
     Al inicializar o cambiar de liga/temporada o añadir métricas al borrador de filtros, el cliente invoca `\$wire.statRanges(leagues, season, specs, period, tournament)`:
     ```json
     // Request: 31-players-statranges-and-matches-hub-request-40-request.json
     {
       "method": "statRanges",
       "params": [[], "", [{ "key": "skore", "unit": "rating" }], null, ""]
     }
     ```
     ```json
     // Response (effects.returns[0]): 31-players-statranges-and-matches-hub-request-40-response.json
     {
       "ranges": {
         "skore|rating": {
           "min": 6.07,
           "max": 7.75
         }
       },
       "pending": []
     }
     ```
     devolviendo los límites `min` y `max` reales del universo filtrado indexados por `"{key}|{unit}"` (ej. `"skore|rating": {"min": 6.07, "max": 7.75}` en Liga MX `2026/2027`) para calibrar los sliders de doble extremo, junto con un arreglo `pending` para métricas cuyos rangos aún se estén precalculando en segundo plano. Permite filtrar simultáneamente hasta **8 métricas** conmutables entre `p90` y `Total`.
   - **RPC de Calendario de Periodos y Fases (`Players::periodCalendar` en [31-players-statranges-and-matches-hub-request-42-request.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/31-players-statranges-and-matches-hub-request-42-request.json) y [31-players-statranges-and-matches-hub-request-42-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/31-players-statranges-and-matches-hub-request-42-response.json), `ev_04b1ede55ec1bd3f547cd81c48dc5a1fc2e4e8b8f9a9020481a3e35092a126e8`) (`[OBSERVADO]`):**
     Cuando el usuario abre el filtro temporal (`Periodo` por jornadas, fases o rango de fechas) o cambia las ligas seleccionadas, el cliente invoca `\$wire.periodCalendar(leagues, season, tournament)`:
     ```json
     // Request: 31-players-statranges-and-matches-hub-request-42-request.json
     {
       "method": "periodCalendar",
       "params": [["2hsidwomhjsaaytdy9u5niyi4"], "", ""]
     }
     ```
     ```json
     // Response (effects.returns[0]): 31-players-statranges-and-matches-hub-request-42-response.json
     {
       "first": "2025-07-11",
       "last": "2026-11-08",
       "stages": [
         {
           "key": "APERTURA",
           "label": "Apertura",
           "first": 1,
           "last": 16
         }
       ],
       "pending": [],
       "tournaments": [
         {
           "key": "apertura",
           "label": "Apertura"
         }
       ],
       "tournamentCurrent": "apertura",
       "tournamentLive": true,
       "tournamentsMixed": false
     }
     ```
     Este payload provee las fechas límite `first`/`last` del calendario para el *date-picker*, las etapas/fases con su rango de jornadas (`first: 1`, `last: 16`), los torneos cortos disponibles (`Apertura` / `Clausura` en ligas con formato partido) y las banderas `tournamentCurrent`, `tournamentLive` y `tournamentsMixed`.

2. **Modo `Equipos` (`setTab("teams")` y `applyTeamFilters(...)` en [19b-players-teams-tab-wait-apply-teams.html](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/19b-players-teams-tab-wait-apply-teams.html)) (`[OBSERVADO]`):**
   - Al conmutar a la pestaña `Equipos` ([request-42](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/19b-players-teams-tab-request-42-request.json): `"method": "setTab", "params": ["teams"]`), Livewire hidrata el componente Alpine `teamsFilterDraft({...})` con tres diccionarios maestros embebidos en el HTML:
     1. `leagueSeasonCoverage`: Mapa de las **40 ligas** indexado por su UUID Opta, especificando qué temporadas están disponibles para cada liga (`["2026/2027", "2025/2026"]` para ligas europeas/Liga MX; `["2027", "2026", "2025"]` para ligas anuales como Argentina, Brasil, MLS, Colombia, Chile, etc.).
     2. `leagueDefaultSeasonLabel`: Temporada activa por defecto de cada una de las 40 ligas (`"2026/2027"` o `"2026"`).
     3. `statCatalog`: Arreglo con los **171 atributos de equipo** agrupados en 12 categorías, donde la clave `key` en este explorador es directamente el **`raw_name` en inglés de Opta** (ej. `"key": "Shots Created"`, `"label": "Tiros generados"`, `"units": ["per_match", "total"]`, `"rangeable": true`; `"key": "Expected Threat"`, `"label": "xT (amenaza esperada)"`; `"key": "PPDA"`, `"units": ["ratio"]`).
   - **Contrato RPC `applyTeamFilters` ([19b-players-teams-tab-request-43-request.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/19b-players-teams-tab-request-43-request.json)) (`[OBSERVADO]`):**
     ```json
     {
       "method": "applyTeamFilters",
       "params": [
         {
           "filterSeason": "",
           "filterTournament": "",
           "filterLeagues": [],
           "statUnit": "per_match",
           "statFilters": [],
           "period": null
         }
       ]
     }
     ```
   - **Regla Dual de Recorte por Paywall en Modo `Equipos` (`Scout` vs `Plus`) (`[OBSERVADO]`):**
     - **Sin filtros estadísticos activos (`statFilters: []`):** Muestra los primeros **10 equipos** de la liga por defecto (`Liga MX` en orden alfabético: `Atlante`, `Atlas`, `Atlético San Luis`, `Club América`, `Cruz Azul`, `Guadalajara`, `Juárez`, `León`, `Monterrey`, `Necaxa` con sus partidos jugados `PJ = 15..16`) y enmascara las filas `11` a `18` como `"Equipo bloqueado"` (`wire:key="search-ghost-0"` a `search-ghost-7`, valor `88.8`).
     - **Con filtros estadísticos aplicados:** El banner superior advierte explícitamente la regla de negocio del plan gratuito: **`"Con filtros, tu plan muestra los 3 primeros · Suscríbete para ver todos y desbloquear las 40+ ligas"`**.
   - **Exportación de Tabla (`data-sk-export-table`):** El método `Players::exportTable()` serializa las filas filtradas en CSV/imagen (restringido por paywall en cuenta gratuita mediante `data-sk-paywall-downloads`).

---

### 3.5. Payloads de Partidos (`13-match-tabs-*`, `28-match-alineaciones-rpc-full-*`, `32-match-detail-tabs-and-player-modal-capture.json` y `09-match-detail.html`) (`[OBSERVADO]`)

- **Evidencia:** [09-match-detail.html](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/09-match-detail.html) (`ev_97e91618307b79c26283cb7092099714480742f83252e97a242081625f31cf52`), [13-match-tabs-capture.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/13-match-tabs-capture.json) (`ev_1318b6ef36cbf6e763ddae14da0f95b3088da1ea954e8c8993b2994b188569fd`), [32-match-detail-tabs-and-player-modal-capture.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/32-match-detail-tabs-and-player-modal-capture.json) (`ev_6f32762bb5eaa2f8561fb62de9190b30fe0080d805e0bb03ad3377847062ea5f`), [match-1535061-all-player-cards.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/match-1535061-all-player-cards.json) (`85,334 B`, `42` jugadores), [match-1535061-momentum-107pts.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/match-1535061-momentum-107pts.json) (`4,616 B`, `n = 107` puntos), [13-match-tabs-wait-alineaciones-json-0.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/13-match-tabs-wait-alineaciones-json-0.json) (`85.3 KB`), [13-match-tabs-wait-estadisticas-data-momentum-data.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/13-match-tabs-wait-estadisticas-data-momentum-data.json) (`4.6 KB`), [28-match-alineaciones-rpc-full-request-69-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/28-match-alineaciones-rpc-full-request-69-response.json) (`211,254 B`) y [28-match-alineaciones-rpc-full-request-105-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/28-match-alineaciones-rpc-full-request-105-response.json) (`2,537 B`, `ev_74a52e02fbfe3463262bfdc3648bc82b62958c735f8153d56f6c56cf21ab706d`).
- **Partido auditado:** `9dy7dhz5f13b2ejz2a5tok2l0` (alias de dataset: `match-1535061`) — **Pumas UNAM 2 - 2 Club América** (`1,57 xG – 1,83 xG`), Jornada 16 Liga MX Apertura 2026/2027, Sábado 7 de noviembre de 2026, Estadio Olímpico Universitario (asistencia: `40.530`, árbitro: `César Arturo Ramos Palazuelos`).

#### A. Pestaña `Alineaciones` (`setTab(['alineaciones'])` · `211,254 B`) y Tarjetas de Jugadores ([match-1535061-all-player-cards.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/match-1535061-all-player-cards.json) · `85,334 B`) (`[OBSERVADO]`)
Al invocar `MatchDetail::setTab(['alineaciones'])` ([28-match-alineaciones-rpc-full-request-69-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/28-match-alineaciones-rpc-full-request-69-response.json) · `211,254 B`), el servidor devuelve en `effects.html` el campo táctico interactivo con los 22 titulares posicionados en sus formaciones Opta (`5-3-2` para Pumas UNAM y `4-2-3-1` para Club América) e inyecta dentro de `<script type="application/json" x-ref="cards">` ([match-1535061-all-player-cards.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/match-1535061-all-player-cards.json) / [13-match-tabs-wait-alineaciones-json-0.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/13-match-tabs-wait-alineaciones-json-0.json) · `85,334 B`) un diccionario indexado por el **UUID Opta (`personId`) de cada uno de los 42 jugadores convocados** (22 titulares + 9 cambios que ingresaron + 11 suplentes en banca sin minutos), donde además se observa el sistema híbrido de fotos `media.api-sports.io` + fallback CDN de FotMob (`images.fotmob.com/image_resources/playerimages/{fotmob_id}.png` para R. Dourado `1069546`, C. Borja `690073` y S. Cáceres `609892`):

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
- **Carga diferida de Mapas Individuales del Partido (`loadPlayerEvents` y `keeperGoalmouth`):**
  Al abrir la pestaña `Alineaciones`, el cliente dispara automáticamente la llamada RPC Livewire `POST /livewire-e3175f40/update` con `"method": "loadPlayerEvents", "params": []` (`13-match-tabs-post-request-104.json`), que hidrata en memoria los puntos de mapa de calor (`player-heat.js`). Cuando el usuario abre el modal de un portero, el cliente invoca bajo demanda `$wire.keeperGoalmouth([playerId])`, documentado en la subsección `3.5.C`.

#### B. Serie Minuto a Minuto de Momentum ([match-1535061-momentum-107pts.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/match-1535061-momentum-107pts.json) / [13-match-tabs-wait-estadisticas-data-momentum-data.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/13-match-tabs-wait-estadisticas-data-momentum-data.json) · `4,616 B`, `n = 107` puntos) (`[OBSERVADO]`)
Inyectado en el atributo `data-momentum-data` (y `<script type="application/json">`) dentro de la pestaña `Estadísticas` ([32-match-detail-tabs-and-player-modal-capture.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/32-match-detail-tabs-and-player-modal-capture.json)), y renderizado por [momentum-chart.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/momentum-chart.js).
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

#### C. Contrato RPC `keeperGoalmouth` (`OptaKeeperGoalmouthService`) en Modal de Partido y Perfil de Portero (`[OBSERVADO]`)

- **Evidencia:**
  1. **Modal de Partido (Keylor Navas `9sme7jykdv8msgfu0nxx6h39x` en Pumas UNAM 2-2 Club América):** [28-match-alineaciones-rpc-full-request-105-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/28-match-alineaciones-rpc-full-request-105-response.json) (`2,537 B`, `ev_74a52e02fbfe3463262bfdc3648bc82b62958c735f8153d56f6c56cf21ab706d`), invocado mediante `"method": "keeperGoalmouth", "params": ["9sme7jykdv8msgfu0nxx6h39x"]`.
  2. **Perfil Estacional de Portero (Luis Ángel Malagón `a1qs3b34p5u2s6mmlhdkgdp7t` en Liga MX Apertura 2026/2027, 6 PJ / 28 tiros a puerta):** [27-goalkeeper-rpc-request-46-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/27-goalkeeper-rpc-request-46-response.json) (`18,937 B`, `ev_fe42082ccfb04731fd689598d84d1596a35361d94ca19ba7707e87a1c1fc8ab0`), recibido en `heatmap-data-updated.params.goalmouth`.
  3. **Consumidor JS:** [goalmouth-map.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/goalmouth-map.js).
- **Normalización Espacial de `OptaKeeperGoalmouthService` (`[OBSERVADO]`):**
  - El objeto `frame` explicita el marco de referencia de los calificadores de boca de portería de Opta (`Qualifier 102` = `Goalmouth Y`, `Qualifier 103` = `Goalmouth Z`): `{"post_left": 45.2, "post_right": 54.8, "crossbar": 38}`.
  - Para cada tiro a puerta en `shots[]`, el servicio PHP ya entrega las coordenadas proyectadas y normalizadas en el cuadrado unitario $[0, 1] \times [0, 1]$ dentro del arco (`x` de poste izquierdo a poste derecho, e `y` de travesaño a ras de césped o viceversa según el canvas de `goalmouth-map.js`), junto con `xgot` (`Expected Goals On Target` / `PSxG`), `goal`, `penalty`, `head`, `minute` y `rival`.
  - Además, pre-calcula `summary` y la matriz de zonas de portería `zones` ($3 \times 3 = 9$ cuadrantes: 3 alturas $\times$ 3 columnas horizontales) desglosados en tres cortes: `"all"` (todos los tiros a puerta), `"open"` (sin penales) y `"penalties"` (solo penales). En `summary`, la métrica **Goles prevenidos (`prevented`)** se calcula exactamente como:
    $$\text{prevented} = \text{round}\big(\text{xgot} - \text{goals},\ 2\big)$$
    (verificado en Keylor Navas: $\text{xgot} = 1.50,\ \text{goals} = 2 \Rightarrow \text{prevented} = \mathbf{-0.50}$; y en Luis Malagón: $\text{xgot} = 10.45,\ \text{goals} = 12 \Rightarrow \text{prevented} = \mathbf{-1.55}$ en total, y en penales $\text{xgot} = 2.77,\ \text{goals} = 2 \Rightarrow \text{prevented} = \mathbf{+0.77}$).

##### Esquema TypeScript `[OBSERVADO]` de `GoalmouthPayload`
```typescript
interface GoalmouthPayload {
  frame: {
    post_left: 45.2;   // Coordenada Opta Goalmouth Y del poste izquierdo
    post_right: 54.8;  // Coordenada Opta Goalmouth Y del poste derecho
    crossbar: 38;      // Coordenada Opta Goalmouth Z del travesaño
  };
  matches: number;     // 1 en modal de partido; N partidos jugados en perfil de temporada (ej. 6)
  shots: Array<{
    x: number;         // Posición horizontal normalizada en [0, 1] dentro de la portería
    y: number;         // Posición vertical normalizada en [0, 1] dentro de la portería
    goal: boolean;     // true = Gol concedido, false = Atajada
    penalty: boolean;  // true = Tiro penal
    head: boolean;     // true = Remate de cabeza
    xgot: number;      // xGOT (PSxG) del remate a puerta (ej. 0.459, 0.9611)
    minute: number;    // Minuto del partido
    rival: string | null; // Nombre del club rival en perfil de temporada (ej. "Pumas UNAM"); null en partido único
  }>;
  summary: {
    all: GoalmouthSummarySplit;
    open: GoalmouthSummarySplit;
    penalties: GoalmouthSummarySplit;
  };
  zones: {
    all: [GoalmouthZoneRow, GoalmouthZoneRow, GoalmouthZoneRow];       // Matriz 3x3 (9 zonas de portería)
    open: [GoalmouthZoneRow, GoalmouthZoneRow, GoalmouthZoneRow];
    penalties: [GoalmouthZoneRow, GoalmouthZoneRow, GoalmouthZoneRow];
  };
}

interface GoalmouthSummarySplit {
  faced: number;       // Tiros a puerta recibidos (saves + goals)
  saves: number;       // Atajadas
  goals: number;       // Goles recibidos
  save_pct: number | null; // Porcentaje de atajadas (saves / faced * 100) con 1 decimal
  xgot: number;        // Suma de xGOT recibidos
  prevented: number;   // Goles prevenidos = round(xgot - goals, 2)
}

type GoalmouthZoneRow = [GoalmouthZoneCell, GoalmouthZoneCell, GoalmouthZoneCell];

interface GoalmouthZoneCell {
  shots: number;
  goals: number;
  saves: number;
  save_pct: number | null;
}
```

##### Payload Íntegro Capturado en [28-match-alineaciones-rpc-full-request-105-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/28-match-alineaciones-rpc-full-request-105-response.json) (`keeperGoalmouth(['9sme7jykdv8msgfu0nxx6h39x'])` · Keylor Navas, `2,537 B`) (`[OBSERVADO]`)
```json
{
  "frame": { "post_left": 45.2, "post_right": 54.8, "crossbar": 38 },
  "matches": 1,
  "shots": [
    {
      "x": 0.6771,
      "y": 0.05,
      "goal": true,
      "penalty": false,
      "head": false,
      "xgot": 0.5426,
      "minute": 3,
      "rival": null
    },
    {
      "x": 0.9062,
      "y": 0.2,
      "goal": true,
      "penalty": true,
      "head": false,
      "xgot": 0.9611,
      "minute": 72,
      "rival": null
    }
  ],
  "summary": {
    "all": { "faced": 2, "saves": 0, "goals": 2, "save_pct": 0, "xgot": 1.5, "prevented": -0.5 },
    "open": { "faced": 1, "saves": 0, "goals": 1, "save_pct": 0, "xgot": 0.54, "prevented": -0.46 },
    "penalties": { "faced": 1, "saves": 0, "goals": 1, "save_pct": 0, "xgot": 0.96, "prevented": -0.04 }
  },
  "zones": {
    "all": [
      [
        { "shots": 0, "goals": 0, "saves": 0, "save_pct": null },
        { "shots": 0, "goals": 0, "saves": 0, "save_pct": null },
        { "shots": 0, "goals": 0, "saves": 0, "save_pct": null }
      ],
      [
        { "shots": 0, "goals": 0, "saves": 0, "save_pct": null },
        { "shots": 0, "goals": 0, "saves": 0, "save_pct": null },
        { "shots": 0, "goals": 0, "saves": 0, "save_pct": null }
      ],
      [
        { "shots": 0, "goals": 0, "saves": 0, "save_pct": null },
        { "shots": 0, "goals": 0, "saves": 0, "save_pct": null },
        { "shots": 2, "goals": 2, "saves": 0, "save_pct": 0 }
      ]
    ],
    "open": [
      [
        { "shots": 0, "goals": 0, "saves": 0, "save_pct": null },
        { "shots": 0, "goals": 0, "saves": 0, "save_pct": null },
        { "shots": 0, "goals": 0, "saves": 0, "save_pct": null }
      ],
      [
        { "shots": 0, "goals": 0, "saves": 0, "save_pct": null },
        { "shots": 0, "goals": 0, "saves": 0, "save_pct": null },
        { "shots": 0, "goals": 0, "saves": 0, "save_pct": null }
      ],
      [
        { "shots": 0, "goals": 0, "saves": 0, "save_pct": null },
        { "shots": 0, "goals": 0, "saves": 0, "save_pct": null },
        { "shots": 1, "goals": 1, "saves": 0, "save_pct": 0 }
      ]
    ],
    "penalties": [
      [
        { "shots": 0, "goals": 0, "saves": 0, "save_pct": null },
        { "shots": 0, "goals": 0, "saves": 0, "save_pct": null },
        { "shots": 0, "goals": 0, "saves": 0, "save_pct": null }
      ],
      [
        { "shots": 0, "goals": 0, "saves": 0, "save_pct": null },
        { "shots": 0, "goals": 0, "saves": 0, "save_pct": null },
        { "shots": 0, "goals": 0, "saves": 0, "save_pct": null }
      ],
      [
        { "shots": 0, "goals": 0, "saves": 0, "save_pct": null },
        { "shots": 0, "goals": 0, "saves": 0, "save_pct": null },
        { "shots": 1, "goals": 1, "saves": 0, "save_pct": 0 }
      ]
    ]
  }
}
```

##### Extracto de `goalmouth` Estacional en [27-goalkeeper-rpc-request-46-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/27-goalkeeper-rpc-request-46-response.json) (Luis Malagón · 6 PJ, 28 Tiros Recibidos) (`[OBSERVADO]`)
```json
{
  "frame": { "post_left": 45.2, "post_right": 54.8, "crossbar": 38 },
  "matches": 6,
  "shots": [
    { "x": 0.9062, "y": 0.05, "goal": false, "penalty": false, "head": false, "xgot": 0.459, "minute": 8, "rival": "Pumas UNAM" },
    { "x": 0.875, "y": 0.05, "goal": true, "penalty": true, "head": false, "xgot": 0.9522, "minute": 77, "rival": "Pumas UNAM" }
  ],
  "summary": {
    "all": { "faced": 28, "saves": 16, "goals": 12, "save_pct": 57.1, "xgot": 10.45, "prevented": -1.55 },
    "open": { "faced": 25, "saves": 15, "goals": 10, "save_pct": 60.0, "xgot": 7.67, "prevented": -2.33 },
    "penalties": { "faced": 3, "saves": 1, "goals": 2, "save_pct": 33.3, "xgot": 2.77, "prevented": 0.77 }
  }
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
4. **Mapa de Portería (`OptaKeeperGoalmouthService` / [goalmouth-map.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/goalmouth-map.js)) (`[OBSERVADO]`):**
   - Verificado en vivo en [28-match-alineaciones-rpc-full-request-105-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/28-match-alineaciones-rpc-full-request-105-response.json) (Keylor Navas) y [27-goalkeeper-rpc-request-46-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/27-goalkeeper-rpc-request-46-response.json) (Luis Malagón). Proyecta los tiros a puerta recibidos por el arquero a partir del marco Opta `frame = { post_left: 45.2, post_right: 54.8, crossbar: 38 }` en coordenadas normalizadas $[0, 1] \times [0, 1]$ dentro de `shots[]`, y los renderiza en 3 vistas: `Mapa de calor` (`heat`: filtrable por `Atajadas`, `Goles`, `Ambos`), `Tiros` (`shots`: círculos escalados por `xgot`) y `Zonas` (`zones`: matriz `3x3` de 9 cuadrantes de la portería con `{ shots, goals, saves, save_pct }` desglosada en `all`, `open` y `penalties`).

---

### 4.7. Motor de Proyecciones de Liga (Monte Carlo / xPts) y Probabilidades Pre-Partido

- **Clasificación:** `[OBSERVADO]` en `03-team.html` (pestaña `Resultados`) y `14-league-tabs-wait-projection.html`; `[INFERIDO]` para el simulador estocástico de calendario restante.
1. **Probabilidades 1X2 Pre-Partido (`Antes del partido (%)` en `03-team.html`) (`[OBSERVADO]`):**
   - En el historial de partidos de `03-team.html`, cada encuentro muestra la terna de probabilidades $(P_{\text{local}}, P_{\text{empate}}, P_{\text{visita}})$ calculada antes del pitido inicial (ej. Pumas UNAM vs Club América J16: **`31% / 26% / 43%`**; Club América vs Toluca J15: **`41% / 26% / 33%`**; Club América vs Pachuca J14: **`62% / 20% / 19%`**).
   - La nota explicativa en UI documenta la regla de *no-leakage* temporal del modelo:
     > *"La barra es la probabilidad que daba el modelo antes del partido, solo con los partidos anteriores; el resultado que se dio va marcado."*
2. **Simulación Monte Carlo del Torneo y Liguilla (`14-league-tabs-wait-projection.html`) (`[OBSERVADO]` / `[INFERIDO]`):**
   - A partir de las probabilidades 1X2 de los partidos restantes del calendario (en J16 de Liga MX resta 1 jornada regular + la llave de Liguilla), el backend ejecuta miles de simulaciones Monte Carlo del cierre del torneo para producir:
     - **`Pts proy.`:** Esperanza matemática de puntos al cierre de la fase regular ($\text{Pts}_{\text{actuales}} + \sum_{m \in \{ \text{restantes} \}} (3 P_W(m) + 1 P_D(m))$). Por ejemplo, para Cruz Azul (32 pts con 1 partido restante): `Pts proy. = 33,1`.
     - **`Pos. proy.`:** Esperanza matemática de la posición final ($\sum_{k=1}^{18} k \cdot P(\text{pos} = k)$). Verificación numérica exacta sobre la fila de **Cruz Azul** en `14-league-tabs-wait-projection.html`:
       $$E[\text{Pos}] = 1 \times 0.444 + 2 \times 0.385 + 3 \times 0.171 = 0.444 + 0.770 + 0.513 = \mathbf{1.727 \approx 1.7}$$
       Verificación numérica exacta sobre la fila de **Club América**:
       $$E[\text{Pos}] = 1 \times 0.258 + 2 \times 0.306 + 3 \times 0.318 + 4 \times 0.118 = 0.258 + 0.612 + 0.954 + 0.472 = \mathbf{2.296 \approx 2.3}$$
     - **Probabilidades de Hitos (`Superlíder`, `Liguilla`, `Campeón`) y Matriz $18 \times 18$ de Posiciones Finales:** Calculadas contabilizando la fracción de simulaciones Monte Carlo en que cada club termina en la posición $k \in \{1 \dots 18\}$ o gana la serie eliminatoria de Liguilla.

---

## 5. Registro Formal de Incógnitas REA ([evidence/rea-unknowns.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/rea-unknowns.json)): Resolución de `unk_c7104fcac7a6781cc23c6d1216a43d4cc6e1e384c408bca299be9c4270d61191` y Fronteras de Caja Negra del Servidor

Conforme al protocolo de auditoría forense REA, [evidence/rea-unknowns.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/rea-unknowns.json) registra **4 entradas (`revision: 2`)**: **1 incógnita de severidad `medium` resuelta y verificada al 100 % en Wave 3 (`status: "resolved"`, `disposition: "verified"`, `truthVerified: true`)** sobre la Piedra Rosetta de los tres proveedores de datos y el catálogo de las 40 ligas, y **3 incógnitas residuales de severidad `low` (`status: "open"`)** que delimitan la lógica que reside exclusivamente en el código PHP privado del servidor de origen (`https://www.statiskicks.com`) o detrás de controles de autorización de pago (`Plus` · \$129 MXN/mes):

| # | `unknown_id` REA | Categoría | Severidad | Estado (`revision: 2`) | Título y Alcance Técnico |
|---|---|---|---|---|---|
| 1 | `unk_c7104fcac7a6781cc23c6d1216a43d4cc6e1e384c408bca299be9c4270d61191` | `data-provider-rosetta-and-locked-leagues` | `medium` | **`resolved` (`verified`, `truthVerified: true`)** | **Piedra Rosetta de 3 proveedores (Stats Perform / Opta SDAPI UUIDs de 25 chars + API-Football numeric IDs + FotMob CDN fallback) y catálogo íntegro de las 40 ligas (9 `Scout` + 31 `Plus`).** |
| 2 | `unk_3ffbf6b463b1f26fc643b3a6539eb1c20a8c6bbefb3efa86a2399337eeb22e23` | `backend-opta-ingestion-cron` | `low` | `open` | **Frecuencia exacta del scheduler/colas Laravel Artisan y nivel de credenciales del feed Stats Perform SDAPI en el servidor de origen.** |
| 3 | `unk_6c968367f663c52fef00c7cd11c2fc40d38a709990f5c46d90d9f37fb4311a39` | `backend-rating-weights` | `low` | `open` | **Pesos posicionales exactos en servidor dentro de `App\Services\Opta\OptaMatchRatingService` para el cálculo escalar de `SKORE` (`0.00–10.00`).** |
| 4 | `unk_c22a37c87f1d1dcb9bb68b65b2a5cc12247f0c94cab5c7cfabcd7bf45ede19f2` | `backend-paywall-gated-team-tabs` | `low` | `open` | **Instancias de datos en vivo dentro de las pestañas de equipo restringidas en servidor al plan `Plus` (`stats`, `maps`, `compare`) y filas truncadas de liga.** |

---

### 5.1. Detalle de la Incógnita Resuelta en Wave 3 y de las 3 Incógnitas Residuales de Servidor (`[OBSERVADO]`)

#### 0. `unk_c7104fcac7a6781cc23c6d1216a43d4cc6e1e384c408bca299be9c4270d61191` · Piedra Rosetta de Proveedores y Catálogo de 40 Ligas (`RESOLVED` · `truthVerified: true`)
- **Estado formal en [evidence/rea-unknowns.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/rea-unknowns.json):** `status: "resolved"`, `disposition: "verified"`, `revision: 2`, respaldado por `ev_04b1ede55ec1bd3f547cd81c48dc5a1fc2e4e8b8f9a9020481a3e35092a126e8` y `ev_a1d8facdf931a87bf33ba5e703e23d73cd2ee0c4550557ba3b84cdb9a1c10088`.
- **Evidencia probatoria consolidada en Wave 3 (`[OBSERVADO]`):**
  1. **Stats Perform / Opta SDAPI (`[0-9a-z]{25}`):** El comentario de desarrollador en [07-players-wire-script-0.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/inline-pages/07-players-wire-script-0.js) (`// Accent-insensitive, on the league, its country in Spanish or as Opta names it, and the region`) y el catálogo [rosetta-177-opta-attributes-catalog.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/rosetta-177-opta-attributes-catalog.json) (`13` categorías, `177` atributos con nombres crudos exactos de Opta SDAPI TM3/MA2) prueban que toda la identidad de negocio (`leagueId`, `teamId`, `playerId`, `fixtureId`, `seasonId`, `stageId`) pertenece a Opta SDAPI.
  2. **API-Football (`api-sports.io`) (`\d+`):** Mapeado 1:1 para las **40 competiciones** en [rosetta-40-leagues-opta-apifootball.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/rosetta-40-leagues-opta-apifootball.json) (`/storage/media/leagues/{api_football_league_id}.png`), para los clubes en [rosetta-teams-opta-apifootball.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/rosetta-teams-opta-apifootball.json) (`/storage/media/teams/{api_football_team_id}.png`) y para los retratos primarios de jugadores (`https://media.api-sports.io/football/players/{api_football_player_id}.png`, verificado también en los 20 resultados de `GET /players/search?q=Luis` en [30-player-tabs-compare-desempeno-modals-request-63-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/30-player-tabs-compare-desempeno-modals-request-63-response.json)).
  3. **FotMob CDN (`images.fotmob.com`) (`\d+`):** Identificado como proveedor secundario/fallback de retratos de jugadores (`https://images.fotmob.com/image_resources/playerimages/{fotmob_id}.png`, ej. `1069546` Rodrigo Dourado, `690073` Cristian Borja y `609892` Sebastián Cáceres en [03-team.html](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/03-team.html) y [match-1535061-all-player-cards.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/match-1535061-all-player-cards.json)).

#### 1. `unk_3ffbf6b463b1f26fc643b3a6539eb1c20a8c6bbefb3efa86a2399337eeb22e23` · Pipeline de Ingesta Opta SDAPI (`backend-opta-ingestion-cron`)
- **Por qué es estrictamente de servidor:** La programación del cron de Laravel (`app/Console/Kernel.php` o `routes/console.php`), los workers de cola (`Horizon` / `Redis` / `Database Queue`), las llaves de API hacia Stats Perform SDAPI (`TM3`/`TM4`/`F9`/`F24`/`MA1`) y el job de cruce de fotografías con `v3.football.api-sports.io` se ejecutan en el backend sin exponer endpoints públicos de administración.
- **Frontera exacta probada desde el cliente (`[OBSERVADO]`):**
  1. Se probaron los identificadores primarios de 25 caracteres en base-36 de Opta SDAPI para las 40 ligas (`competition_id`), los 67 calendarios de torneo (`season_tmcl`), clubes (`contestant_id`), jugadores (`person_id`) y partidos (`match_id`).
  2. Se probaron los **`raw_event_id` enteros de eventos Opta** (ej. `2995900373`, `2995971849` en [26-player-rpc-full-request-64/65/66-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/26-player-rpc-full-request-64-response.json)) y los **`typeId` crudos de Opta** (`type_primary: "1"`, `"12"`, `"15"`, etc.), además de las 171 etiquetas `raw_name` en inglés de equipos y las 147/176 etiquetas `raw_name` de jugadores/porteros.
  3. Se probó la reconciliación determinista 1:1 de media contra los IDs enteros de **API-Football (`media.api-sports.io`)** tanto en fotos de jugadores como en los archivos locales `/storage/media/leagues/{id}.png` y `/storage/media/teams/{id}.png`.

#### 2. `unk_6c968367f663c52fef00c7cd11c2fc40d38a709990f5c46d90d9f37fb4311a39` · Pesos Internos de `OptaMatchRatingService` (`backend-rating-weights`)
- **Por qué es estrictamente de servidor:** El método PHP `App\Services\Opta\OptaMatchRatingService` computa la nota escalar `skore` (`0.00–10.00`) en el servidor antes de almacenarla por partido y enviarla ya calculada en `performanceData.summaryMatches[].skore`, `cards[playerId].rating` y `rankingData`. Los coeficientes exactos por rol que ponderan las acciones de Opta no se transmiten al cliente.
- **Frontera exacta probada desde el cliente (`[OBSERVADO]`):**
  1. Se recuperó íntegro el módulo [skore.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/skore.js), que documenta la firma `App\Services\Opta\OptaMatchRatingService::format()` y `::grade()`, los umbrales exactos de clasificación (`low < 6.50`, `6.50 <= mid < 7.00`, `high >= 7.00`) y la rampa RGB continua por tramos en el dominio $[5.80, 7.80]$.
  2. Se observaron las distribuciones empíricas completas de `SKORE` por liga y posición: en Liga MX `2026/2027` ($N = 402$ jugadores, media de liga **`6.77`**, mínimo **`6.07`**, máximo **`7.75`** para J. Brunetta; en porteros $N = 24$, mínimo **`6.13`**) y en MLS `2026` ($N = 670$ jugadores, media de liga **`6.78`**, mínimo **`5.96`**, máximo **`8.29`** para Lionel Messi en [04b-messi-full-request-45-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/04b-messi-full-request-45-response.json)).
  3. Se descubrió en `performanceData.summaryMatches` ([04b-messi-full-request-45-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/04b-messi-full-request-45-response.json), [26-player-rpc-full-request-44-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/26-player-rpc-full-request-44-response.json) y [27-goalkeeper-rpc-request-44-response.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/27-goalkeeper-rpc-request-44-response.json)) que el esquema de base de datos por partido incluye las columnas `raw_vaep: null`, `offensive_vaep: null` y `defensive_vaep: null`, actualmente inactivas en favor de `skore`.

#### 3. `unk_c22a37c87f1d1dcb9bb68b65b2a5cc12247f0c94cab5c7cfabcd7bf45ede19f2` · Pestañas y Filas Restringidas por Paywall en Servidor (`backend-paywall-gated-team-tabs`)
- **Por qué es estrictamente de servidor / paywall:** Cuando un usuario anónimo o con plan gratuito (`Scout`) solicita en `/team/{slug}-{id}` las pestañas `stats`, `maps` o `compare`, el método `TeamDetail::setTab()` verifica la suscripción en sesión y devuelve la vista del modal de paywall sin serializar los datos de esa pestaña; del mismo modo, en `/league/{id}` trunca en servidor las filas `5..18` de `projection` y `9..18` de `maps`, y en `/players` trunca los candidatos `4..20` de `loadSimilarPlayersData`.
- **Frontera exacta probada desde el cliente (`[OBSERVADO]`):**
  1. **Recuperación del 100% de los esquemas de renderizado desde los bundles JS servidos sin minificar:** Aunque el servidor omite las instancias de datos en las pestañas bloqueadas de equipo, los consumidores [team-pass-network.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/team-pass-network.js), [attribute-charts.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/attribute-charts.js), [event-map.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/event-map.js) y [league-maps.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/named/league-maps.js) se descargan completos en el navegador y permitieron documentar cada campo de `data-team-pass-network-payload` y `data-team-pass-matrix-table`.
  2. **Diferenciación forense entre *Server-Enforced Paywall* y *UI-Only Paywall*:** La auditoría de llamadas RPC Livewire en [26-player-rpc-full-capture.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/captures/26-player-rpc-full-capture.json) demostró que mientras `TeamDetail::setTab` aplica control de acceso en servidor, en `PlayerDetail` los métodos `loadSimilarPlayersData([])` ([request-52](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/26-player-rpc-full-request-52-response.json)), `ensureComparisonDataLoaded([])` ([request-62](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/26-player-rpc-full-request-62-response.json) · `333 KB`) y `loadMapGraphData` para sub-eventos con candado visual como `shots_xg` ([request-65](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/26-player-rpc-full-request-65-response.json)) y `pass_progressive` ([request-66](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/26-player-rpc-full-request-66-response.json)) responden con el payload `[OBSERVADO]` completo sin requerir sesión `Plus`.
