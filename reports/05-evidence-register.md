# 05 — Registro Forense de Evidencias REA (`Evidence Register`)

> **Objetivo Auditado:** `https://www.statiskicks.com/`  
> **Worktree Aislado:** `.worktrees/REA-stats` (Rama `REA-stats`)  
> **Motor Forense:** REA (`rea-agents`, Skill `reverse-engineer-anything` v49)  
> **Bundle Determinista de Sesión REA:** `evidence/rea-evidence-bundle.json` (26 registros, 247,817,175 bytes)  
> **Resumen Canónico REA:** [rea-evidence-summary.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/rea-evidence-summary.json)

---

## 1. Clasificación Epistemológica

Siguiendo la disciplina forense de REA y el estándar de ingeniería inversa de PitchLab, cada hallazgo del dossier se clasifica bajo una de cuatro etiquetas de autoridad:

| Etiqueta | Autoridad en REA | Definición Operativa |
|---|---|---|
| **`[OBSERVADO]`** | `controlled-replay` / `shipped-artifact` / `historical-reference` | Hecho verificado directamente en los bytes de los 28 scripts exportados por REA, hojas CSS, DOM HTML renderizado, capturas de red HTTP/Livewire o respuestas JSON del servidor. |
| **`[INFERIDO]`** | `analyst-inference` / `derived` | Conclusión técnica deducida de la estructura de los contratos observados, nombres de propiedades, convenciones de IDs de Opta/Stats Perform y API-Football o comentarios internos de los desarrolladores (`SK-18`, `SK-19`). |
| **`[RECONSTRUIDO]`** | Verificación algorítmica | Fórmulas matemáticas, transformaciones geométricas de coordenadas de cancha, suavizado KDE de mapas de calor, matrices de pases y escalas de color reconstruidas a partir del código cliente desminificado/original. |
| **`[DESCONOCIDO]`** | `unknown` (Bounded Gap) | Lógica que reside exclusivamente en el backend privado de Laravel/PHP (p. ej. credenciales exactas del feed de Stats Perform/Opta, pesos internos del cálculo servidor de `SKORE` o simulación Monte Carlo de proyecciones de liga) y que no se transmite al navegador. |

---

## 2. Ledger Completo de Registros de Evidencia REA (26 `evidence_id`)

Todos los análisis y capturas fueron ejecutados a través del servidor MCP `rea` y exportados atómicamente mediante `export_evidence_bundle` hacia `.worktrees/REA-stats/evidence/rea-evidence-bundle.json`:

| # | `evidence_id` | Operación REA | Autoridad | Objetivo / Alcance Auditado |
|---|---|---|---|---|
| 1 | `ev_a57fa32050d099e784ee0a2f3d1e0f302a0c917dcc1a8c686b3c3b363666b0df` | `capture_browser_scenario` | `controlled-replay` | Captura completa de `https://www.statiskicks.com/` (Home): DOM, accesibilidad, storage, screenshot y 53 transacciones HTTP con cuerpos de respuesta completos (`01-home-capture.json`). |
| 2 | `ev_ae1b0493c16a440b51a7596afbe0c5af7cf297e66014c9e86aa9638018249441` | `export_web_scripts` | `historical-reference` | Extracción verificada por SHA-256 de los 28 scripts JS retenidos en `01-home-capture.json` hacia `evidence/javascript/home-scripts/` (`manifest.json`). |
| 3 | `ev_9e16df560f7b4515f78a74c98f23526df34fa3ee180451991dfd5c4b6c5ec2d7` | `analyze_javascript_application` | `shipped-artifact` | Grafo de aplicación e inspección estática AST de los 28 archivos JS exportados (1,071,240 bytes de texto, 256,416 nodos AST visitados, 164 módulos/nodos, 135 hallazgos). |
| 4 | `ev_a859568ca7db50587c1641eb0abe6a44c8aa6a0ed8d47ba2ce6572109480017a` | `inspect_analysis_view` | `shipped-artifact` | Vista `summary` sobre el padre `ev_9e16df56...` con estadísticas de cobertura sintáctica y semántica (`boundary: 255`, `call-flow: 10647`, `closure: 10803`, `data-flow: 62762`, `event: 58`, `request: 2`, `timer: 16`). |
| 5 | `ev_c6c72944edca6f9ce94b4e6fd79de313b548a71abc0d9de5d87e747dccc5c26f` | `inspect_analysis_view` | `shipped-artifact` | Vista `javascript-routes` (`collection: "routes"`) sobre `ev_9e16df56...`. |
| 6 | `ev_9e97f0da03ce8f6adbf6e2d536cba1f4eec1ce93768cad44b320afa928e9d3f4` | `inspect_analysis_view` | `shipped-artifact` | Paginación de módulos (`collection: "modules"`, `offset: 0, limit: 50`) sobre `ev_9e16df56...`. |
| 7 | `ev_9b93f41739eb99c51777c9286037ed7e8ccad7ddb5cdb0c658a3aebbc031e733` | `inspect_analysis_view` | `controlled-replay` | Proyección `environment-manifest` sobre la captura de Home `ev_a57fa320...` clasificando los 53 recursos por origen (`www.statiskicks.com`, `cdn.jsdelivr.net`, `fonts.googleapis.com`, `fonts.gstatic.com`). |
| 8 | `ev_296f62498cf90c3e87cd48ef454168c2d290f4a839a442208f9adfef04c8aeda` | `capture_browser_scenario` | `controlled-replay` | Sondeo controlado del endpoint JSON `/search?q=america`, `/search?q=messi` y `/search?q=madrid` (`02-search-api-capture.json`). |
| 9 | `ev_8b664e194ac67d05a98289a150adcb3f310fb2622bcc70a084ab5c7d978cb365` | `capture_browser_scenario` | `controlled-replay` | Captura completa con cuerpos de red de `/team/club-america-eu8c408f59yx7egaqossbv25e` (retenida íntegra en `rea-evidence-bundle.json`, >10.5 MB). |
| 10 | `ev_bba17f5b8205d109afaa59748445fa3e6b8b763f44c88cfbb1a22847a3d405b9` | `capture_browser_scenario` | `controlled-replay` | Captura completa con cuerpos de red de `/player/c5ryhn04g9goikd0blmh83aol/lionel-messi` (retenida íntegra en `rea-evidence-bundle.json`, >10.6 MB). |
| 11 | `ev_c5ee120c0b76e8a9fab5e7dbb9d324d0e932523cc84b2bc86cf9a3471b1f2118` | `capture_browser_scenario` | `controlled-replay` | Captura de `/partidos?estado=finalizados` (`05-matches-capture.json`). |
| 12 | `ev_bc7ebac834b73578fd1ad9b68b2e5d06774bea085283377a605b1989ed3114af` | `capture_browser_scenario` | `controlled-replay` | Captura de Liga MX `/league/2hsidwomhjsaaytdy9u5niyi4` (`06-league-capture.json`). |
| 13 | `ev_97e91618307b79c26283cb7092099714480742f83252e97a242081625f31cf52` | `capture_browser_scenario` | `controlled-replay` | Captura del explorador de scouting `/players` (`07-players-capture.json`). |
| 14 | `ev_fba261f1679008e019d57771da85a84cf122769fdc93ab4a8088dfb8ed05ae76` | `capture_browser_scenario` | `controlled-replay` | Captura de planes y precios `/planes` (`08-planes-capture.json`). |
| 15 | `ev_aa5f2d74196b21062c132e8b6ec8934f023380f93c40f78f99e333a43bfc9977` | `capture_browser_scenario` | `controlled-replay` | Captura ligera DOM/Screenshot/Headers de Club América `/team/club-america-eu8c408f59yx7egaqossbv25e` (`03-team-capture.json`). |
| 16 | `ev_59e57f74d8e4894a8c290cd1f58354701d398bea6301f1cdfe07edeeef89f945` | `capture_browser_scenario` | `controlled-replay` | Captura ligera DOM/Screenshot/Headers de Luis Romo `/player/1cyhpfi77dom7gmpuownxlcrt/luis-romo` (`04-player-capture.json`). |
| 17 | `ev_e97046d53210bf233f1dc576a689f77283053071ff3e34bcc5c159f70a48d467` | `capture_browser_scenario` | `controlled-replay` | Captura de detalle de partido `/partido/pumas-unam-vs-club-america-9dy7dhz5f13b2ejz2a5tok2l0` (`09-match-detail-capture.json`). |
| 18 | `ev_643a343e34fadc05f5e77db59a547ec794b7b026f0f8da2458052732d6c28445` | `capture_browser_scenario` | `controlled-replay` | Captura del catálogo de ligas `/leagues` (`10-leagues-capture.json`). |
| 19 | `ev_29ff56dc035f280348f37506fb13b97ef5f91f78d023d03c699407f1af4a7cf2` | `capture_browser_scenario` | `controlled-replay` | Captura de inicio de sesión `/login` (`11-login-capture.json`). |
| 20 | `ev_045ab7e234fb4d11eef578d40992f5c0ce080058997d3af2b9bd60cda4e9bfcc` | `capture_browser_scenario` | `controlled-replay` | Captura de registro `/register` (`12-register-capture.json`). |
| 21 | `ev_1318b6ef36cbf6e763ddae14da0f95b3088da1ea954e8c8993b2994b188569fd` | `capture_browser_scenario` | `controlled-replay` | Escenario interactivo multi-paso sobre `/partido/pumas-unam-vs-club-america-9dy7dhz5f13b2ejz2a5tok2l0` haciendo clic en pestañas `alineaciones`, `estadisticas`, `eventos`, `datos` (`13-match-tabs-capture.json`). |
| 22 | `ev_bd430f00f4cc3e0cb3e7d1c12ddd223536657c09ba63ee662b710fb3bdab574a` | `capture_browser_scenario` | `controlled-replay` | Escenario interactivo multi-paso sobre `/league/2hsidwomhjsaaytdy9u5niyi4` haciendo clic en pestañas `projection`, `maps`, `scatter`, `scout-ratings` (`14-league-tabs-capture.json`). |
| 23 | `ev_f944d1f7761451d7144ab5bdf5bbffcc01211fd62806ebf9298cc86527d498ac` | `inspect_analysis_view` | `shipped-artifact` | Inspección detallada de ítem de módulo AST para `event-map.js` (`jag_node_19afe52cd429c33d5c8d88de87ff12460944c83b6a9706a48f0ffce8c4851bfd`). |
| 24 | `ev_c1ece6e874a978ad36a2eaa7a6619c1b6418f52cb1257fe6dd1a9bb549ca9190` | `inspect_analysis_view` | `shipped-artifact` | Inspección detallada de ítem de módulo AST para `attribute-charts.js` (`jag_node_16c8c7029896fe2c3b78e2fc6688a0173f280cef441c6d985b99d21286911bd7`). |
| 25 | `ev_2191f71b0297e698f986efc5ccee69555a95d8051cd43d90ed0b3ebd5743c80b` | `trace_application_feature` | `analyst-inference` | Trazabilidad de grafo (`direction: "outgoing"`) sobre el módulo `event-map.js` (`jatr_a735749e...`). |
| 26 | `ev_5e82f59a9268f45ac0f73d19b19287c5866a288569713ed71d729385188aaf62` | `capture_browser_scenario` | `controlled-replay` | Sondeo preliminar de conectividad navegador (`steps/63`). |

---

## 3. Inventario de Scripts Exportados por REA (`export_web_scripts`)

Materializados en [manifest.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/home-scripts/manifest.json) y organizados con sus nombres originales en `evidence/javascript/named/`:

| # | Archivo | Bytes | SHA-256 | URL de Origen |
|---|---|---:|---|---|
| 1 | `bootstrap.bundle.min.js` | 80,721 | `0833b2e9c3a26c258476c46266e6877fc75218625162e0460be9a3a098a61c6c` | `https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js` |
| 2 | `chart.umd.min.js` | 205,637 | `d46d97a1fd022c5fb29fa2f45ebcbc32202d73aeebf076ce5f7248f5498fc7d7` | `https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js` |
| 3 | `chartjs-plugin-datalabels.min.js` | 12,937 | `20c08f3d9c6d2ef76df6d6a6f1127c0013339fe32add24222276c398c6308c38` | `https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js` |
| 4 | `home-motion.js` | 3,999 | `22559f239e73a2d3cfc2933aceaa258693487e84ef9e9513a20eb7c70d18f1d6` | `https://www.statiskicks.com/custom_assets/js/home-motion.js?v=1791380772` |
| 5 | `sk-tooltip.js` | 5,286 | `fe7367342c87234dc2fa7e0157511fd63252c25e9bcaafa004668144720bca8b` | `https://www.statiskicks.com/custom_assets/js/sk-tooltip.js?v=1792175742` |
| 6 | `download-paywall.js` | 4,871 | `607fc88ac6d0f2a549f033851901599a3b1afb1cc771ae1904e8f11ccec67e3c` | `https://www.statiskicks.com/custom_assets/js/download-paywall.js?v=1793826522` |
| 7 | `chart-download.js` | 82,271 | `1b5758059e8826e09c245ca01e94963880d38b8b1fb416493f4588815490eada` | `https://www.statiskicks.com/custom_assets/js/chart-download.js?v=1794084628` |
| 8 | `search-results-image.js` | 15,500 | `25372b446898cb2530c1975c9050d492f82fd9df045033a3bfdfa697a000169f` | `https://www.statiskicks.com/custom_assets/js/search-results-image.js?v=1794084628` |
| 9 | `percentile-rows.js` | 16,494 | `0c3610604969038c0cf35435cb87fd4547652088dad675798567d0423998c7c1` | `https://www.statiskicks.com/custom_assets/js/percentile-rows.js?v=1793360776` |
| 10 | `skore.js` | 1,025 | `67c17289fb0d3ba5d9a011729ca66f2c0cf4b6553b15d889175b419d5a5dc9c6` | `https://www.statiskicks.com/custom_assets/js/skore.js?v=1793032870` |
| 11 | `attribute-picker.js` | 3,993 | `558267b51ef8c3d6531378faad3aa2fa3ca911005cf807c216b70e81f54208ed` | `https://www.statiskicks.com/custom_assets/js/attribute-picker.js?v=1791577902` |
| 12 | `attribute-charts.js` | 43,926 | `e18e09e5eb7df4f53bf7359a6b880e8345042e128d4b6e4f9b37a9f419cb6dda` | `https://www.statiskicks.com/custom_assets/js/attribute-charts.js?v=1794084628` |
| 13 | `heatmap.js` | 8,470 | `ae977db0cf0906866538b5a5794ee07784cc89094997dbee21e6b943d32b5d91` | `https://www.statiskicks.com/custom_assets/js/heatmap.js?v=1791561866` |
| 14 | `goalmouth-map.js` | 19,168 | `9f0355309588c0a610eea120f783753795a981ee05222a8db951c644b9db89a3` | `https://www.statiskicks.com/custom_assets/js/goalmouth-map.js?v=1794084628` |
| 15 | `event-map.js` | 101,374 | `2ea7370b26667ae8bcfe84789682a80a7fc8d3d7f4da7a65929203a3eb80471d` | `https://www.statiskicks.com/custom_assets/js/event-map.js?v=1793880030` |
| 16 | `league-maps.js` | 47,505 | `8dc40486c29927a54150723be3a9260add810eeb7c75a9dedb64996df70c9f5f` | `https://www.statiskicks.com/custom_assets/js/league-maps.js?v=1794084628` |
| 17 | `league-scatter.js` | 62,610 | `f1ad9e5d980503c9d6aca9747f536d1a37dc913947642829145e8d238c38c88f` | `https://www.statiskicks.com/custom_assets/js/league-scatter.js?v=1794084628` |
| 18 | `league-switcher.js` | 974 | `bb18600c8c581ceede69688481ab0612772eeb0061d716da71b249f68efbb29a` | `https://www.statiskicks.com/custom_assets/js/league-switcher.js?v=1793361650` |
| 19 | `team-profile.js` | 7,387 | `988e995db44d6d408fb99ea5eb30a212f584f7f6b910c1b36c4cb17b4dcae813` | `https://www.statiskicks.com/custom_assets/js/team-profile.js?v=1791380772` |
| 20 | `team-age-profile.js` | 16,117 | `e07abe994dfbf94e98e191d066a40463e516de94414e56df99604e2b534d7f7a` | `https://www.statiskicks.com/custom_assets/js/team-age-profile.js?v=1794168592` |
| 21 | `team-xg-rolling.js` | 13,984 | `9c5c70564ce37db63366d9db0ee8e44dadf009a11d19588df4f1b162da642997` | `https://www.statiskicks.com/custom_assets/js/team-xg-rolling.js?v=1791380772` |
| 22 | `team-formation-profile.js` | 3,323 | `ce680500d130ce08de8b755287790804d529a1e20c7da941c6107f110fd7a00e` | `https://www.statiskicks.com/custom_assets/js/team-formation-profile.js?v=1791380772` |
| 23 | `team-pass-network.js` | 43,792 | `a37025c7884995e1c017ef0db0bbd96853353809105ae4135bd598e50f56c400` | `https://www.statiskicks.com/custom_assets/js/team-pass-network.js?v=1794084628` |
| 24 | `live-motion.js` | 4,880 | `63ece23dfa253f2ad5bb9c709dfd4c11f7f37c6faf372e6bce7b21b4b2fe458e` | `https://www.statiskicks.com/custom_assets/js/live-motion.js?v=1792175986` |
| 25 | `momentum-chart.js` | 19,165 | `7c85598927d5e81fce72b9a1b2d54feec95dceff0a5a9c407ebf6d07aedd92a1` | `https://www.statiskicks.com/custom_assets/js/momentum-chart.js?v=1792708794` |
| 26 | `player-heat.js` | 6,706 | `14d579d847824dcf3a38f993be443dd95ca8d1a17711cc9ddc7f5c4631e2b98e` | `https://www.statiskicks.com/custom_assets/js/player-heat.js?v=1792491156` |
| 27 | `scroll-lock.js` | 1,452 | `14b451fbb0042bd23c1f1aade6d1603e210ce55a359ef050d332c6e5e36ad92d` | `https://www.statiskicks.com/custom_assets/js/scroll-lock.js?v=1792589840` |
| 28 | `livewire.min.js` | 237,673 | `4f67d55949e15c5c6d680b31dec3474dd2f9efb144a5661455fe5326ce40bf1f` | `https://www.statiskicks.com/livewire-e3175f40/livewire.min.js?id=6b3709b1` |

---

## 4. Inventario de Hojas de Estilo CSS Extraídas

| Archivo | Bytes | SHA-256 | URL de Origen |
|---|---:|---|---|
| [sk.css](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/css/sk.css) | 215,616 | `2c340879ba9660e66c69a5542f975ac73dd36c01316354175a3faa73bf9324c3` | `https://www.statiskicks.com/custom_assets/css/sk.css?v=1794168592` |
| [home.css](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/css/home.css) | 34,184 | `9df1c77dff801892233bff923e4e72a59071d7a46152e4726188b73168c583c1` | `https://www.statiskicks.com/custom_assets/css/home.css?v=1794177958` |
| [nav-mega-menu.css](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/css/nav-mega-menu.css) | 17,012 | `843148b1aa4744c831575de19b624d100adb22c22fdc996994773050bf05d233` | `https://www.statiskicks.com/custom_assets/css/nav-mega-menu.css?v=1791380772` |
| [page-loader.css](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/css/page-loader.css) | 13,168 | `dfae99edd30c4bbd2873eb0e712af34a046efe96fa411af3710b66621398008b` | `https://www.statiskicks.com/custom_assets/css/page-loader.css?v=1791380772` |
| [plan-cards.css](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/css/plan-cards.css) | 6,032 | `e89284781b405a1de46f49e94f5c28d406c13f7362354ef7edec0e6d5c8c9838` | `https://www.statiskicks.com/custom_assets/css/plan-cards.css?v=1794177958` |

---

## 5. Capturas de Pantalla y Snapshots DOM / JSON

### 5.1 Capturas Visuales (`evidence/screenshots/`)
- [01-home.png](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/screenshots/01-home.png) (`339,487 B` · SHA-256: `9a5b182400b18a6397575ee5ef019ce8aab5afb866c87dabb760a60d2d9b6a55`)
- [03-team.png](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/screenshots/03-team.png) (`269,513 B` · SHA-256: `9d0ca4254198669171854f1ccb72e0e5be78b8a17ac9af5f73397049f972f63c`)
- [04-player.png](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/screenshots/04-player.png) (`380,890 B` · SHA-256: `7dc383d6e4321f6a945ed8b16a9e22a9df8b2508919d8ba87dd87660c66d9a79`)
- [05-matches.png](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/screenshots/05-matches.png) (`57,727 B` · SHA-256: `25a7add6cc51d39a163dc39e652aee381221159c89df99249ee9ff92cea46e1b`)
- [06-league.png](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/screenshots/06-league.png) (`207,809 B` · SHA-256: `e96bc999b25c32d37ec0ebb90c4ce3b99696e2aff25d3bb454d95d2142c6f436`)
- [07-players.png](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/screenshots/07-players.png) (`57,333 B` · SHA-256: `65fd4540dfc7f31572ad27f958a22213f40bebdbbc1883f91f9f0acb18a4131d`)
- [08-planes.png](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/screenshots/08-planes.png) (`115,657 B` · SHA-256: `728e73b95cededef3b168051487e0d281c914c7a02950760bc9468ba432e52f7`)
- [09-match-detail.png](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/screenshots/09-match-detail.png) (`147,400 B` · SHA-256: `c476429f1cab0fe4eff320cd7a7e143ce25164b7b3f53214e028c8705eca81a5`)
- [10-leagues.png](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/screenshots/10-leagues.png) (`240,014 B` · SHA-256: `6594a99c7cff4bf56034dced86e25ba20c07e6e33566597d304a4666c261e361`)
- [11-login.png](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/screenshots/11-login.png) (`115,062 B` · SHA-256: `e3c1f0b66e6ca08b18ccdab24539945516b86a0d332518ef403e62e96431c676`)
- [12-register.png](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/screenshots/12-register.png) (`115,520 B` · SHA-256: `47d8a8a11cf3e5d4c0b66f60a1814e45e8a0834e6f6a39ab272f54f2f78f62ed`)
- [13-match-tabs-wait-datos.png](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/screenshots/13-match-tabs-wait-datos.png) (`122,873 B` · SHA-256: `d84b84fb29b689b7b908da886ef7e9d7aba14eaeb2c0de7ceafc884ee71fac36`)
- [14-league-tabs-wait-scout-ratings.png](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/screenshots/14-league-tabs-wait-scout-ratings.png) (`224,404 B` · SHA-256: `da362d44fd693c37cdab85ccfde8db5383244fb239ae42c7ef80d78fde8ea5e9`)

### 5.2 Payloads JSON y Esquemas de Red (`evidence/network-schemas/`)
- [search-america.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/search-america.json), [search-messi.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/search-messi.json), [search-madrid.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/search-madrid.json)
- [03-team-data-attribute-charts-payload.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/03-team-data-attribute-charts-payload.json) (`120,440 B`)
- [03-team-data-team-profile-payload.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/03-team-data-team-profile-payload.json) (`12,688 B`)
- [03-team-data-team-xg-rolling-payload.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/03-team-data-team-xg-rolling-payload.json) (`10,929 B`)
- [03-team-data-team-age-profile-payload.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/03-team-data-team-age-profile-payload.json) (`4,347 B`)
- [03-team-data-team-formation-profile-payload.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/03-team-data-team-formation-profile-payload.json) (`183 B`)
- [04-player-data-attribute-charts-payload.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/04-player-data-attribute-charts-payload.json) (`45,438 B`)
- [04-player-data-bootstrap.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/04-player-data-bootstrap.json) (`15,709 B`)
- [13-match-tabs-wait-alineaciones-json-0.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/13-match-tabs-wait-alineaciones-json-0.json) (`85,334 B`)
- [13-match-tabs-wait-estadisticas-data-momentum-data.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/13-match-tabs-wait-estadisticas-data-momentum-data.json) (`4,616 B`)
- [14-league-tabs-wait-maps-data-bootstrap.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/14-league-tabs-wait-maps-data-bootstrap.json) (`10,113 B`)
- Catálogo completo de 160 archivos con sus hashes SHA-256 en [artifact-sha256-inventory.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/artifact-sha256-inventory.json).

---

## 6. Límites e Incertidumbre Documentada (`Bounded Unknowns`)

1. **Ponderaciones internas de `SKORE` en Backend (`[DESCONOCIDO]`):** El cliente recibe el valor `skore` ya calculado (0–100) en tablas de jugadores, plantillas y tarjetas, y `skore.js` aplica la paleta semántica de 5 niveles (`90+`, `80–89`, `70–79`, `60–69`, `<60`). Los pesos exactos por posición con los que el backend pondera los percentiles para producir el escalar `SKORE` se ejecutan en PHP/SQL en el servidor.
2. **Modelo de ingesta desde Stats Perform / Opta y API-Football (`[DESCONOCIDO]`):** Se observa de manera inequívoca la presencia de UUIDs de 25 caracteres en base-36 de Stats Perform / Opta SDAPI (`competitionId`, `tournamentCalendarId`, `contestantId`, `personId`, `matchId`), coordenadas de cancha Opta $(0..100, 0..100)$ e IDs numéricos de `api-sports.io` para imágenes. La frecuencia exacta de los *cron jobs* de sincronización en el servidor Laravel (Artisan commands / queues) no es visible desde el cliente, salvo por los indicadores de caché y actualización en vivo (`live-motion.js`, `xgLive` vs `xgSettled`).
3. **Vistas exclusivas de suscriptores (`[OBSERVADO]` / `[DESCONOCIDO]`):** Las pestañas bloqueadas para usuarios anónimos (`scatter` en Liga, `eventos`/`datos` en Partido, `set-pieces`/`rival-analysis`/`autoreport` en Equipo) son protegidas en servidor mediante plantillas *ghost* (`sk-unlock-zone`), aunque toda la lógica de renderizado y esquemas de datos esperados por esas pestañas sí fue recuperada íntegramente desde los scripts `league-scatter.js`, `event-map.js` y `team-profile.js` enviados al navegador.
