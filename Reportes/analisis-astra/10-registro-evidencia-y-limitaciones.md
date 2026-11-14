# 10 — Registro Maestro de Evidencia REA, Trazabilidad Epistémica y Limitaciones (Olas 1 + 2)

**Objetivo auditado:** `https://astraanalisis.com/` (*Astra AI* / *Astra Analysis*) y `https://astra-ai.expo.app/`  
**Fecha de auditoría:** `2026-11-14` (Olas 1 y 2 completadas)  
**Motor de ingeniería inversa:** `rea-agents@6.8.0` (MCP + CLI Playwright CDP + Analizador Semántico AST JS + `AgentEnv`, skill `v49`)  
**Rama del repositorio:** `scrap`

---

## 1. Metodología y Alcance Ético

Toda la investigación se ejecutó bajo reglas estrictas de **observación pasiva, lectura autorizada y cero mutaciones**:
1. **Artefactos públicos servidos al cliente:** descarga íntegra de `index.html`, `manifest.webmanifest`, los **25 chunks JavaScript** de Expo Router (`1,927,005` bytes; raíz SHA-256 `cb5a4ab3b3262cbfb2ee0b0f888cd19a192302dd1bd13e1fac29b13fc9020ad6`) y aislamiento de los **100 módulos propios/configuración** en `astra-first-party/` (`345,913` bytes; raíz SHA-256 `a75a10b23cf3e976df10993e1d0b351ab79c533938aa744758fafe4b141bf357`).
2. **Navegación autenticada legítima:** uso exclusivo de la cuenta de prueba suministrada por el usuario (`has_access: true`, periodo de prueba de 7 días activo), inyectando la contraseña mediante referencias de secreto de REA (`ASTRA_PASSWORD`) y purgando todo `access_token` / `refresh_token` antes de persistir archivos en disco (**0 secretos / 0 JWTs almacenados**, verificado mediante escaneo automatizado).
3. **Cero acciones intrusivas o mutaciones:** no se invocó `admin_dashboard`, `delete-account` ni la creación de órdenes reales (`action: "checkout"`) en `payments`; toda exportación `AgentEnv` se ejecutó con `dry_run: true`; no se realizaron pruebas de inyección, fuerza bruta, evasión de controles de acceso/RLS ni resolución de CAPTCHAs.

---

## 2. Registro Maestro de `evidence_id` de REA (`83` Registros Únicos)

El inventario estructurado completo de los **`83` registros únicos `ev_...`** reside en [rea-evidence-ledger.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/rea-evidence-ledger.json) y los hashes SHA-256 de los artefactos principales en [artifact-sha256-inventory.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/artifact-sha256-inventory.json).

### 2.1 Evidencias Fundacionales de Análisis Estático y Vistas MCP (Ola 1 + Ola 2)

| `evidence_id` | Operación REA | Autoridad / Confianza | Alcance Exacto |
|---|---|---|---|
| `ev_65da2d799f8e38fb47969ed42788d109282794ea80635bed7d2772a7977cc222` | `capture_browser_scenario` | `controlled-replay` / `observed` | Reconocimiento anónimo inicial de `https://astraanalisis.com/` (`118` eventos: HTML, `manifest.webmanifest`, chunks base, `my_access` anónimo, consultas iniciales a `fixtures` y `games`). |
| `ev_87d52f5c34a65dd9f3669f452fc3fd0e3cbb89aa735d2471899965d48008996e` | `analyze_javascript_application` | `shipped-artifact` / `derived` | Análisis estático del directorio completo `app/` (`26` archivos, `205,723` nodos AST visitados, `215` hallazgos). |
| `ev_06e64c17364017f73c15a045e58ee4b196cf76f035801944f4802b98175dffcb` | `analyze_javascript_application` | `shipped-artifact` / `derived` | Análisis semántico focalizado (`source_paths`) sobre los **22 chunks de rutas** de Expo Router (`148,771` B, `44,694` nodos AST, **100% sin truncamiento**). |
| `ev_56684417ff30a6b644d1dd65c9c9dee1f9c59d7434fbbcaab9fc81a0fc232493` | `analyze_javascript_application` | `shipped-artifact` / `derived` | **(Ola 2)** Análisis AST y semántico **100% sin truncamiento** (`max_semantic_nodes: 300000`) de los **100 módulos propios** en `astra-first-party/` (`114,883` nodos AST, `72,018` nodos semánticos, `114,650` relaciones, `0` errores). |
| `ev_b09a16ba6f4b0343221fcc53af3b053ac9cc8cba87cd39988f67bfb7eca26214` | `inspect_analysis_view` | `shipped-artifact` / `derived` | **(Ola 2)** Vista `summary` de `ev_56684417...` (`data-flow: 94,664`, `object-flow: 13,360`, `closure: 5,257`, `call-flow: 1,150`, `promise-ownership: 138`, `boundary: 63`, `timer: 18`). |
| `ev_cbf3b3d820cb123fa3cf6053f089c95c4bdbd0fb904dbd8f584ad5fa1752c557` | `analyze_javascript_application` | `shipped-artifact` / `derived` | **(Ola 2)** Análisis estático de los **43 módulos `@supabase/*` v`2.118.0`** (`mod_0936`–`mod_0978`, `275,806` B, `71,500` nodos AST, `558` relaciones de promesas). |
| `ev_d098b9b2c55ec561117d25a486c08e72b08d90f8548f09e9babc7eb6a520f80a` | `trace_javascript_semantics` | `shipped-artifact` / `derived` | **(Ola 2)** Prueba formal `backward-provenance` sobre `.rpc`: confirma que solo existen **4 RPCs** en todo el cliente (`my_access`, `admin_dashboard`, `record_ai_view`, `search_teams`). |
| `ev_037006908ce6d24f5d7131089bcc18dee56fa5f9c85315b5878a0d9008d81d2e` | `trace_javascript_semantics` | `shipped-artifact` / `derived` | **(Ola 2)** Prueba formal `backward-provenance` sobre `.invoke`: confirma que solo existen **7 Edge Functions** en todo el cliente (`10` sitios de llamada). |
| `ev_44b4cd0cec47b41d70d45172dc9ca8f412047c3593db6050b786d140bc2d42e5` | `capture_browser_scenario` | `controlled-replay` / `observed` | **(Ola 2)** Captura móvil enfocada en backend Supabase para modelado de superficie `AgentEnv` (`9` herramientas Supabase sintetizadas). |
| `ev_f8005defccbcc5953cffdd66dfa58848e4c3ec5b1e051257cc8bfaa4ec1602c4` | `export_environment_bundle` | `controlled-replay` / `derived` | **(Ola 2)** Síntesis `AgentEnv` (`dry_run: true`) clasificando `4` lecturas respaldadas por estado, `2` grabadas y `3` herramientas `POST` retenidas como `no-state-target`. |

*(Los otros `73` registros derivados de vistas `inspect_analysis_view`, trazas `trace_application_feature` / `trace_javascript_semantics` y comparaciones diferenciales `compare_web_screenshots` están catalogados íntegramente en [rea-evidence-ledger.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/rea-evidence-ledger.json) y en los capítulos `11`, `12`, `13`, `15` y `16`).*

### 2.2 Escenarios Interactivos Runtime vía REA (`10` escenarios en vivo, `254` pasos totales)

| `evidence_id` | Pasos | Resumen Retenido | Cobertura Funcional Verificada en Vivo |
|---|---|---|---|
| `ev_42e6c7319eb27372b49758df47887b2764d276a39d760c6d6f0874b7f5d03bc6` | `14/14` | `raw/02-authenticated-tour.json` | Login en `/cuenta`, transición `my_access` (`has_access: false -> true`), `profiles`, carteleras `/`, `/nba`, `/nfl`, `/nhl`. |
| `ev_fc43c6696ef7a62da591fe98b66a05d96f17be9fcbb4d51ab6e6d9c4c60b57d3` | `24/24` | `raw/03-futbol-summary.json` | Detalle de Fútbol: Liga MX `1550951`, Nations League `1528974`, LaLiga2 `1570024`, Europa League `1636276`. |
| `ev_ae93e5b0dd674307ba47ef7bc3b4deb222bbd235d3dabb26bcfec8634219f46c` | `32/32` | `raw/04-us-sports-summary.json` | Deportes US: NBA `401909980` y `401909296` (`nba-players`), NHL `2026020312` y `2026020310`, NFL domingo/lunes, MLB temporada baja. |
| `ev_b2082a83f40b298b1f62d60e156ccb00dfa1bb20161c30653505db326b4395e3` | `50/50` | `raw/05-equipos-institucional-summary.json` | Modal jugador NBA, NFL `401873063` (DraftKings odds), perfiles `/equipo/{futbol,nba,nhl,nfl}`, `/historial/nba`, `/siguiendo`, `/nosotros`, `/privacidad`, `/terminos`. |
| `ev_b24b4829a5c7f11fb2e112bbe5fbe70dc4ff30a2a7546d50e6b0f7af41b1a064` | `10/10` | `raw/06-mlb-y-historial-summary.json` | Perfil MLB `/equipo/mlb/119` (LA Dodgers) e historial no almacenado `/historial/nfl/12/401873006` (`stored: false`). |
| `ev_6eeb8dd5a5d6eee02222d677dfc193890dce23841503272ab2cde41605df83ea` | `44/44` | `raw/07-mobile-unopened-summary.json` | **(Ola 2 — Móvil `390x844 @ 2x`)** `LaunchSplash`, `TrialWelcome`, cascada `AppAnnouncements` -> `NbaLaunchNotice`, `GlassSportsBar` Liquid Glass, bug de paywall anónimo en NBA finalizado, `/instalar` con `beforeinstallprompt`. |
| `ev_0d41e898056efd259e9bae992b2db1ae3e13c1cca3fb394270efd40edf773d36` | `58/58` | `raw/08-hidden-routes-flows-summary.json` | **(Ola 2 — Rutas Ocultas)** Buscador `search_teams` vs `sport_teams`, `siguiendo` poblado con métricas, MLB histórico NLCS `849810`, `/eliminar-cuenta` (solo lectura), `/pago/0000...` (3× `404`), `/administracion`, `/confirmado`, `/restablecer` y 404 `<Unmatched />`. |
| `ev_dbc43f3c6ce8fe2c352b35863559c0c1ada30e43878e7de23e7f08d11271ca1a` | `6/6` | `evidence/wave2-routes-and-mobile-audit.json` | **(Ola 2)** Montaje en frío de `/confirmado#error=access_denied...` y apertura en vivo de la ruta interna expuesta **`https://astraanalisis.com/_sitemap`** (`captura 39`). |
| `ev_1b3f88e87b4106020869c3079c2111548b75e3742deda9c9d13e9c71ca9aa92a` | `10/10` | `evidence/wave2-routes-and-mobile-audit.json` | **(Ola 2)** Guarda anónima en `/pago/0000...` (`"Entra con tu cuenta"`) y estado terminal `'error'` autenticado tras 3× HTTP `404`. |
| `ev_e5979de3b375a2cd17627ca77e33a08055b441229eeab930953399b1aa82ef28` | `6/6` | `raw/09-expo-host-redirect-summary.json` | **(Ola 2 — Host Alterno)** Prueba en vivo de redirección JS cliente (`HTTP 200` sin `301`) desde `https://astra-ai.expo.app/nosotros` hacia `https://astraanalisis.com/nosotros`. |

---

## 3. Matriz Maestra Consolidada (`OBSERVADO` / `DERIVADO` / `INFERIDO` / `DESCONOCIDO`)

| Dominio / Afirmación | Nivel Epistémico | Fuente / Prueba Verificable |
|---|---|---|
| Stack frontend: **Expo SDK 58.0.0**, **React 19.3.0** (React Compiler), **22 rutas `.tsx` + `/_sitemap` expuesto**, **1,030 módulos Metro** (`100` propios/config) | **OBSERVADO** | `astra-first-party/`, `ev_56684417...`, `ev_dbc43f3c...`, captura `39` |
| Hosting sobre **Expo EAS Hosting (`astra-ai.expo.app`, R2 + Workers)** detrás de **Cloudflare O2O (`astraanalisis.com`, registrado `2026-11-08`)**, sin HSTS en raíz y **0 apps nativas / 0 canales OTA** en `u.expo.dev` | **OBSERVADO** | `ev_e5979de3...`, RDAP, CT logs, `u.expo.dev/f7056bae-...` (`404`), [15-infraestructura-expo-eas-dns-y-superficie-externa.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/15-infraestructura-expo-eas-dns-y-superficie-externa.md) |
| Comunidad Telegram (`3,463` miembros) y **plataforma hermana `tipsterzone.org/t/astra` (`astraanalysisorg-astra.expo.app`)** bajo la misma org de Expo | **OBSERVADO** | HTML público `t.me/+9jzp7DYLucM4MDYx`, DNS/TLS/RDAP en [infra-eas-osint-audit.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/infra-eas-osint-audit.json) |
| Backend **Supabase (`bbfjdshvlcynngjdkvsk.supabase.co`)**, `@supabase/supabase-js@2.118.0` (`124 KB` de código muerto en `__common`), **14 tablas**, **4 RPCs** y **7 Edge Functions** | **OBSERVADO** + **DERIVADO** | `ev_cbf3b3d8...`, `ev_d098b9b2...`, `ev_03700690...`, [supabase-deep-surface.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/supabase-deep-surface.json) |
| Génesis exacta el **`2026-10-18T13:16:14Z`** con **MLB (`game_id=849817`) como Deporte #1**, `1,900` predicciones históricas totales (`1,754` finalizadas, `0` backfills ocultos) | **OBSERVADO** | Consultas `GET` sobre las 13 tablas legibles en [production-db-forensic-audit.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/production-db-forensic-audit.json) |
| Ecuaciones cerradas exactas de los **5 deportes**, incluyendo **MLB** ($\frac{5}{9}\text{FIP}_{\text{SP}} + \frac{4}{9}\text{FIP}_{\text{BP}}$, residuo $\le 0.000787$, sesgo de truncamiento sin extra innings) | **OBSERVADO** + **RECONSTRUIDO** | [verify_astra_math.py](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/verify_astra_math.py) (`8/8 OK`) y [mlb-prediction-sample.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/live-payloads/mlb-prediction-sample.json) |
| Modelos exactos de Anthropic (**`claude-sonnet-5-5` del `18` al `22` oct -> `claude-haiku-5-5` desde el `23` oct** + `astra:data-notice`), tokens exactos (`5.07M` totales, ~\$14.73 USD) y **`20.69%` (`6/29`) de inversión total Local/Visitante en NFL** | **OBSERVADO** | Columnas ocultas `model`, `input_tokens`, `output_tokens` en `analyses` y `game_analyses` (`1,739` filas auditadas en [14-auditoria-empirica-bd-calibracion-picks-y-alucinaciones.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/14-auditoria-empirica-bd-calibracion-picks-y-alucinaciones.md)) |
| Calibración empírica (`91.43%` de acierto en $\max(p)\ge 75\%$, solo `6.01%` del catálogo; córners `+1.84%` sobre media; NHL `100%` porteros sin confirmar) e **inserción post-partido en `astra_picks` (`1575213`) y `match_marks`** | **OBSERVADO** | Cruce completo de `predictions`/`game_predictions` vs marcadores finales y `match_live` en [production-db-forensic-audit.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/production-db-forensic-audit.json) |
| Uso offline de **`nflverse` / `nflfastR`** y **`pybaseball` / FanGraphs** en el worker Python de entrenamiento | **INFERIDO** | Nomenclatura exacta de variables (`epa_por_dropback`, `"dome" \| "outdoors"`, `wOBA`, `FIP`, `factor_parque`) |
| Código fuente interno de los workers Python/Edge Functions, *system prompt* literal enviado a Claude y sondeo HTTP directo a `/rest/v1/` (OpenAPI raíz), `/auth/v1/settings` y `OPTIONS /functions/v1/*` | **DESCONOCIDO** | Ejecución en infraestructura privada de servidor / endpoints de metadatos omitidos en red en favor de inspección offline de trazas y SDK |

---

## 4. Qué Quedó Pendiente / Fronteras Técnicas Documentadas

1. **Sondeo en vivo de metadatos administrativos de Supabase (`GET /rest/v1/` raíz OpenAPI, `GET /auth/v1/settings`, `GET /storage/v1/bucket` y `OPTIONS` CORS en Edge Functions):** Estos 4 endpoints puntuales de metadatos no fueron sondeados directamente por red en la Ola 2 (se sustituyeron por auditoría offline de las `515` transacciones grabadas y de `@supabase/supabase-js@2.118.0` en el Cap. `13`, más lectura autorizada `SELECT *` de las 13 tablas públicas en el Cap. `14`).
2. **Código fuente privado del servidor (Workers Python + código TypeScript interno de las 7 Edge Functions + *system prompt* literal de Claude):** Reside exclusivamente en la infraestructura privada del operador; sin embargo, sus ecuaciones matemáticas (`8/8` suites exactas), modelos LLM (`claude-sonnet-5-5` y `claude-haiku-5-5`), proveedores aguas arriba y fallos quedaron reconstruidos empíricamente desde sus entradas/salidas reales.
3. **Auditoría profunda de la plataforma hermana recién descubierta (`tipsterzone.org` / `astraanalysisorg-astra.expo.app`):** En la Ola 2 se descubrió y verificó su existencia, organización compartida en Expo (`astraanalysisorg`), instancia independiente de Supabase (`ucnxbczjueyyjpetqhfi.supabase.co`) y precios (\$99 / \$499 MXN), quedando disponible como objetivo separado si en el futuro se desea descompilar su bundle completo.
4. **Flujos de cobro real (`Stripe` / `Mercado Pago` `action: "checkout"`) y apps nativas iOS/Android:** No se crearon órdenes de pago reales para no contaminar métricas financieras de producción, y se confirmó que actualmente existen `0` apps nativas publicadas en App Store / Google Play (`iap_ios_key: null` y `0` canales en `u.expo.dev`).
