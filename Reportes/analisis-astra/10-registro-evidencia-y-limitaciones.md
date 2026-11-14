# 10 — Registro Maestro de Evidencia REA, Trazabilidad Epistémica y Limitaciones

**Objetivo auditado:** `https://astraanalisis.com/` (*Astra AI* / *Astra Analysis*)  
**Fecha de auditoría:** `2026-11-14`  
**Motor de ingeniería inversa:** `rea-agents@6.8.0` (MCP + CLI Playwright CDP + Analizador Semántico AST JS, skill `v49`)  
**Rama del repositorio:** `scrap`

---

## 1. Metodología y Alcance Ético

Toda la investigación se ejecutó bajo reglas estrictas de **observación pasiva y lectura autorizada**:
1. **Artefactos públicos servidos al cliente:** descarga íntegra de `index.html`, `manifest.webmanifest` y los **25 chunks JavaScript** de Expo Router (`1,927,005` bytes totales; raíz SHA-256 `cb5a4ab3b3262cbfb2ee0b0f888cd19a192302dd1bd13e1fac29b13fc9020ad6`).
2. **Navegación autenticada legítima:** uso exclusivo de la cuenta de prueba suministrada por el usuario (`has_access: true`, periodo de prueba de 7 días activo), inyectando la contraseña mediante referencias de secreto de REA (`ASTRA_PASSWORD`) y purgando todo `access_token` / `refresh_token` antes de persistir archivos en disco (**0 secretos / 0 JWTs almacenados**, verificado mediante escaneo automatizado).
3. **Cero acciones intrusivas o mutaciones:** no se invocó `admin_dashboard`, `delete-account` ni la creación de órdenes en `payments`; no se realizaron pruebas de inyección, fuerza bruta, evasión de controles de acceso/RLS ni resolución de CAPTCHAs.

---

## 2. Registro Completo de `evidence_id` de REA (`16` Registros)

El inventario estructurado completo reside en [rea-evidence-ledger.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/rea-evidence-ledger.json) y los hashes SHA-256 de los 60 artefactos principales en [artifact-sha256-inventory.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/artifact-sha256-inventory.json).

### 2.1 Evidencias de Análisis Estático y Vistas MCP (`11` registros)

| `evidence_id` | Operación REA | Autoridad / Confianza | Alcance Exacto |
|---|---|---|---|
| `ev_65da2d799f8e38fb47969ed42788d109282794ea80635bed7d2772a7977cc222` | `capture_browser_scenario` | `controlled-replay` / `observed` | Reconocimiento anónimo inicial de `https://astraanalisis.com/` (`118` eventos: HTML, `manifest.webmanifest`, chunks base, `my_access` anónimo, consultas iniciales a `fixtures` y `games`). |
| `ev_87d52f5c34a65dd9f3669f452fc3fd0e3cbb89aa735d2471899965d48008996e` | `analyze_javascript_application` | `shipped-artifact` / `derived` | Análisis estático del directorio completo `app/` (`26` archivos, `205,723` nodos AST visitados, `215` hallazgos). |
| `ev_06e64c17364017f73c15a045e58ee4b196cf76f035801944f4802b98175dffcb` | `analyze_javascript_application` | `shipped-artifact` / `derived` | Análisis semántico focalizado (`source_paths`) sobre los **22 chunks de rutas** de Expo Router (`148,771` bytes, `44,694` nodos AST, **100% de cobertura sin truncamiento**). |
| `ev_79b34436d8a68b8d8e0cfa57dfe273135f3851875b2be7776fe5408425768de5` | `inspect_analysis_view` | `shipped-artifact` / `derived` | Vista `summary` de `ev_06e64c17...` (`22/22` archivos completos, `0` errores de parseo, `132` hallazgos, `36,838` aristas `data-flow`). |
| `ev_267a3a963e9c079e6c7afa2371070946d3c184e9f15b673df8a3603cac53ffd1` | `inspect_analysis_view` | `shipped-artifact` / `derived` | Paginación de colección `modules` (`147` nodos de grafo) sobre `ev_06e64c17...`. |
| `ev_ff621e6d81d0c2142b93fa36ded6127d0a25c95518366602854601c48dbfdb2f` | `inspect_analysis_view` | `shipped-artifact` / `derived` | Vista `javascript-routes` (`collection: "routes"`) sobre los 22 chunks hoja. |
| `ev_86f4effd51e3429c8818ae84f21084804c129fb851627eea5b10a17dbbdb282a` | `inspect_analysis_view` | `shipped-artifact` / `derived` | Vista `javascript-routes` (`collection: "summary"`, `complete: 22`, `partial: 0`). |
| `ev_056ff46d3093b4745ffe522786f74a58c01a7e31d8d0e2d4c58e9a54a110b878` | `inspect_analysis_view` | `shipped-artifact` / `derived` | Vista `javascript-routes` (`collection: "sources"`) con hashes individuales de los 22 chunks. |
| `ev_9128d949f1c6848ac0415f7e3c5ec6e730b5e713df6d1d5218bce46d86373799` | `inspect_analysis_view` | `shipped-artifact` / `derived` | Vista `javascript-routes` sobre `ev_87d52f5c...`, extrayendo las 6 rutas literales estáticas en `__common-*.js` (`/`, `/instalar`, `/mlb`, `/nba`, `/nfl`, `/nhl`). |
| `ev_2744fc1f92054aec44d95f63967705876973dd057392eda4779cee8c43db9559` | `inspect_analysis_view` | `shipped-artifact` / `derived` | Inspección de nodos de módulo sobre `ev_87d52f5c...`. |
| `ev_56aa2d7c5b4019cb1248ab8fa63f39055c7f42f1e0a405b83390c196855bb432` | `inspect_analysis_view` | `controlled-replay` / `derived` | Proyección de captura sobre el escenario inicial `ev_65da2d79...`. |

### 2.2 Evidencias Runtime Autenticadas vía REA CLI (`5` escenarios multipaso)

| `evidence_id` | Pasos | Resumen Retenido | Cobertura Funcional Verificada en Vivo |
|---|---|---|---|
| `ev_42e6c7319eb27372b49758df47887b2764d276a39d760c6d6f0874b7f5d03bc6` | `14/14` | `raw/02-authenticated-tour.json` | Login en `/cuenta`, transición de `my_access` (`has_access: false -> true`), `profiles`, carteleras `/`, `/nba`, `/nfl`, `/nhl`. |
| `ev_fc43c6696ef7a62da591fe98b66a05d96f17be9fcbb4d51ab6e6d9c4c60b57d3` | `24/24` | `raw/03-futbol-summary.json` | Detalle de Fútbol: Liga MX `1550951` (`predictions` Dixon–Coles + `analyses` + `match-odds` Marathonbet + `standings` + `record_ai_view`), Nations League `1528974` (`league-standings` fallback), LaLiga2 `1570024` (`match_live` xG), Europa League `1636276` (`astra_picks` + `MomentumCard`). |
| `ev_ae93e5b0dd674307ba47ef7bc3b4deb222bbd235d3dabb26bcfec8634219f46c` | `32/32` | `raw/04-us-sports-summary.json` | Deportes US (`dropped: 0`): NBA `401909980` y `401909296` (`nba-players`), NHL `2026020312` y `2026020310` (`match_live`), NFL domingo `2026-11-15` (`12` juegos `forecast_ready: true`) y lunes `2026-11-16` (`401873065` `forecast_ready: false`), MLB temporada baja. |
| `ev_b2082a83f40b298b1f62d60e156ccb00dfa1bb20161c30653505db326b4395e3` | `50/50` | `raw/05-equipos-institucional-summary.json` | Modal de jugador NBA, detalle NFL `401873063` (49ers @ Cowboys + DraftKings odds), perfiles `/equipo/{futbol,nba,nhl,nfl}` (`team-profile` + `fetchTeamModel`), `/historial/nba/18/401909296` (`stored: true`), `/siguiendo`, `/cuenta`, `/nosotros`, `/privacidad`, `/terminos`. |
| `ev_b24b4829a5c7f11fb2e112bbe5fbe70dc4ff30a2a7546d50e6b0f7af41b1a064` | `10/10` | `raw/06-mlb-y-historial-summary.json` | Perfil MLB `/equipo/mlb/119` (LA Dodgers vía MLB StatsAPI) e historial externo bajo demanda `/historial/nfl/12/401873006` (`stored: false`). |

---

## 3. Matriz Maestra de Clasificación Epistémica (`OBSERVADO` / `INFERIDO` / `DESCONOCIDO`)

| Dominio / Afirmación | Nivel Epistémico | Fuente / Prueba Verificable |
|---|---|---|
| Stack frontend: **Expo SDK 58.0.0**, **React 19.3.0**, **React Compiler activo**, **22 rutas `.tsx`**, **1,030 módulos Metro** (`98` propios) | **OBSERVADO** | `mod_0009`, `mod_0393`, `mod_0770`, `ev_06e64c17...`, [module-map.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/module-map.json) |
| Hosting web sobre **Expo EAS Hosting (`astra-ai.expo.app`)** detrás de **Cloudflare HTTP/3** + RUM `beacon.min.js` | **OBSERVADO** / **INFERIDO** | `REDIRECT_HOSTS` en `mod_0778` (`OBSERVADO`), headers `cf-ray` / `h3` (`OBSERVADO`), origen upstream EAS (`INFERIDO`) |
| Backend **Supabase (`bbfjdshvlcynngjdkvsk.supabase.co`)** con `@supabase/supabase-js@2.118.0` y llave `sb_publishable_...` | **OBSERVADO** | `mod_0778`, `mod_0936`, tráfico de red en `ev_65da2d79...` y `ev_42e6c731...` |
| `@supabase/realtime-js` incluido en bundle pero **100% inactivo** (`0` WebSockets; todo opera por HTTP polling con `useLoad`) | **OBSERVADO** | `mod_0779`, `mod_0950`–`0978`, capturas de red REA |
| Esquema público de **14 tablas PostgREST**, **1 bucket privado** (`profile-avatars`), **4 RPCs** y **7 Edge Functions** | **OBSERVADO** | Consultas cliente en `modules/` + respuestas HTTP en `evidence/live-payloads/` |
| Paywall protegido por **RLS real en PostgreSQL** (patrón *Soft-Null*) para partidos futuros, pero **abierto públicamente (`SELECT *`) en partidos finalizados** | **OBSERVADO** | Comparación de payloads autenticados vs anónimos + `verify_astra_math.py` Suite 8 |
| Ecuaciones e hiperparámetros de los **5 modelos estadísticos** (Fútbol Dixon–Coles `xg_weight=0.70` y derrame `+0.15`; NBA `0.75 ratings + 0.25 Elo`; NFL `0.35 pts + 0.30 EPA + 0.35 Elo + QB`, $\sigma=13.0$; NHL xG `93,598` tiros `AUC=0.7477` + Monte Carlo; MLB `wOBA+FIP+parque` Binomial Negativa $r\approx 5.5$) | **OBSERVADO** + **RECONSTRUIDO** | Columnas JSONB `predictions.context` y `game_predictions.context` (`OBSERVADO`) + reproducción numérica exacta a 4 decimales en [verify_astra_math.py](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/verify_astra_math.py) (`EXIT 0`) |
| Uso de **Claude (Anthropic)** en lote pre-partido y existencia de alucinaciones en producción sin validador post-generación (NFL `401873052`) | **OBSERVADO** | Cadena literal en `mod_1011`, timestamps `analyses.created_at` idénticos y payload real de `games/401873052` |
| Proveedores de datos: **API-Sports** (Fútbol), **ESPN** (NBA/NFL + odds US DraftKings `id="100"`), **NHL Web API** (NHL), **MLB StatsAPI** (MLB) y **Marathonbet** (`id=2` vía API-Sports en Fútbol) | **OBSERVADO** | Atributos `source` en JSONs en vivo, URLs de CDN, IDs nativos y precisión IEEE-754 de 16 dígitos en momios convertidos |
| Uso offline de **`nflverse` / `nflfastR`** (NFL EPA/techo) y **`pybaseball` / FanGraphs** (MLB `wOBA`/`FIP`/parque) en el pipeline de entrenamiento | **INFERIDO** | Nomenclatura exacta de campos (`epa_por_dropback`, `"dome" \| "outdoors"`, `wOBA`, `FIP`, `park_factor`) ausentes en ESPN/MLB GUMBO básico |
| Estructura del panel `/administracion` (`admin_dashboard`: 14 KPIs comerciales, cuentas, vistas IA, órdenes; **cero** métricas de calibración/hit-rate) | **OBSERVADO (en código cliente)** | Lectura estática íntegra de `mod_0755` y `mod_0839` (sin invocar el RPC en red) |
| Modelo comercial: **$199 MXN / 30 días** prepago acumulable sin renovación automática + **7 días gratis**, vía **Stripe** + **Mercado Pago** (con tubería **RevenueCat IAP** apagada en `my_access`) | **OBSERVADO** | `my_access`, `mod_0757`, `mod_0764`, `mod_0863`, `mod_0769` |
| Costo operativo mensual total estimado en **$57 – $101 USD/mes** (*break-even* con 6–11 suscriptores) | **INFERIDO** | Precios públicos vigentes de API-Sports Pro/Ultra, Supabase Pro y procesamiento por lotes en Claude Haiku/Sonnet |
| Código fuente exacto en Python/TypeScript de los workers/crons privados, prompt de sistema literal enviado a Claude y versión exacta de Claude (`Haiku` vs `Sonnet`) | **DESCONOCIDO** | Ejecución exclusiva en infraestructura backend privada fuera del alcance observable desde cliente y APIs públicas |

---

## 4. Limitaciones y Fronteras Documentadas

1. **Ausencia de Source Maps en Producción:** El servidor devuelve el *fallback* SPA (`200 text/html`) ante peticiones `*.js.map`; por tanto, los nombres de variables locales minificadas fueron reconstruidos a partir de propiedades exportadas, literales SQL/PostgREST, textos de interfaz y análisis AST de REA.
2. **Código Interno de Edge Functions y Workers:** No es observable directamente desde el exterior; sus contratos de entrada/salida, proveedores aguas arriba y transformaciones (como la conversión IEEE-754 de momios americanos de DraftKings o los fallbacks de `team-profile`) se establecieron mediante el código invocador y los payloads reales de respuesta.
3. **Temporada Baja de MLB en la Fecha del Análisis (`2026-11-14`):** La cartelera diaria `/mlb` devuelve `0` juegos activos en noviembre, pero el motor, proveedores e historial de MLB quedaron completamente verificados mediante `/equipo/mlb/119` (LA Dodgers), partidos finalizados de postemporada almacenados en `games`/`game_predictions` y el módulo `modelTeamSummary` (`mod_1029`).
