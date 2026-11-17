# 10 — Registro Maestro de Evidencia REA, Proyección AgentEnv, Trazabilidad Epistémica y Limitaciones (Olas 1 + 2)

**Objetivo auditado:** `https://scoutpicks.app/` (Landing/SEO Astro + WebApp `/dashboard/` Beta `v0.1.0`) y `https://api.scoutpicks.aertech-labs.com`  
**Operador legal:** **Aertech Labs, LLC** (`131 Continental Dr, Suite 305, Newark, DE 19713` · `EIN 35-2938733` · `team@aertech-labs.com` · equipo fundador en Buenos Aires, Argentina)  
**Fecha de auditoría:** `2026-11-17` (Olas 1 y 2 completadas)  
**Motor de ingeniería inversa:** `rea-agents@6.9.0` (Servidor MCP + CLI, skill `v62`, `255` herramientas registradas, **`53` registros únicos `ev_...`**)  
**Rama / Worktree:** `analyze_pitchlab_competitor_rea`

---

## 1. Metodología Forense, Operación *Serverless* y Frontera Ética

Toda la investigación de **Scout Picks** a lo largo de las **Olas 1 y 2** se ejecutó bajo las garantías estrictas de **REA (*Reverse Engineer Anything*)**:

1. **Autenticación legítima y operación *serverless* sin ventanas visibles:** El usuario inició sesión una única vez sobre un perfil aislado de Chrome; la ventana visible se cerró limpiamente mediante CDP (`Browser.close`) y toda la captura de las Olas 1 y 2 corrió en segundo plano (`127.0.0.1:9222`), finalizando con el cierre total de los procesos de navegador.
2. **Lectura autorizada y cero mutaciones destructivas:** No se ejecutaron compras reales en RevenueCat/Stripe, no se reclamaron bonos CPA (`perk-claim`), no se alteró el calendario del usuario (`creator/pick-calendar/apply`) ni se ejecutaron escaneos intrusivos.
3. **Sanitización total de credenciales y PII (`0` secretos en disco, validado por Suite `W2-1`):** Todo encabezado `Authorization: Bearer ...`, cookie de sesión, `set-auth-token`, `sp.authToken`, correo personal, teléfono parcial y el ID interno del usuario fueron purgados antes de persistir artefactos en el repositorio (`[REDACTED_AUTH_TOKEN]`, `usr_redacted_0000000000000000000`, `user@redacted.example`).
4. **Síntesis `AgentEnv` en modo `dry_run: true`:** La validación de entorno reproducible (`export_environment_bundle`) se ejecutó con `dry_run: true` (`ev_fb68f72c...`, `ev_252a4bf2...`).

---

## 2. Inventario Criptográfico SHA-256 de Artefactos Primarios (4 Builds en Vivo + 10 Locales Lazy + Astro SEO)

El inventario completo de `20` artefactos firmados reside en [artifact-sha256-inventory.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/scoutpicks/evidence/artifact-sha256-inventory.json) y [first-party-modules-manifest.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/scoutpicks/evidence/first-party-modules-manifest.json):

| Artefacto | Identificador / Ruta | Tamaño (Bytes) | SHA-256 |
|---|---|---:|---|
| **Bundle SPA Build 1 (Ola 1)** | `/dashboard/assets/index-BZ3_gLK3.js` (`34d7fb96...-44092619889.1`) | `3,361,584` | `674b3c11a894c8bc508732ad3031a2dcf3932400c252b1ce68a0ccb146d7d903` |
| **Bundle SPA Build 2 (Ola 1 — `15:22:36 GMT`)** | `/dashboard/assets/index--7dqLkuo.js` (`cb0f6a96...-44112075563.1`) | `3,361,584` | `15bba82d3bdad2d4a99a9cc696ef6ef61ccdbdbacd05b64fc93cb7024a935f68` |
| **Bundle SPA Build 3 (Ola 2 — `+5,483 B` `Guide Videos`)** | `/dashboard/assets/index-De_Y7Tky.js` (`70dc4f66...-44127063438.1`) | `3,367,067` | `40f08b90e0e06ae092507d6d580fd6c4f9b7e1201cf378b1bc0bcfa1ebcf7a75` *(ver `artifact-sha256-inventory.json`)* |
| **Bundle SPA Build 4 (Ola 2 — Exportado REA `ev_3b9c90fb...`)** | `/dashboard/assets/index-DyN-BnCU.js` (`f3845b61...-44130056569.1`) | `3,367,067` | `d0f001bcf070ece3470a61128649840d3cb34bf82b38ce9fec49de769cbe6f8f` |
| **Contenedor `scoutpicks-first-party/` (18 módulos AST)** | [scoutpicks-first-party/](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/scoutpicks/scoutpicks-first-party) (`0` `parse_failures`) | `1,320,530` | `990f733e7d532a0c5188206142403deb515551b6f08d5625bdd074a8c4a5d792` |
| **Contenedor `scoutpicks-lazy-locales/` (10 chunks i18n)** | [scoutpicks-lazy-locales/](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/scoutpicks/scoutpicks-lazy-locales) (`ar`, `de`, `el`, `hi`, `it`, `ja`, `ro`, `ru`, `tr`, `zh`) | `1,043,374` | `d1c65ed63e600f937c7444c0f2c745eb991463f5b93a2c75408f5bbf9d41a907` |
| **Contenedor `astro-landing/` (Landing + Legal)** | [astro-landing/](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/scoutpicks/astro-landing) | `18,564` | `c3c4b17a78bcdb6e585417478a6ceb5bcf6565e428d0bb3b188cf5b8fb45a4d2` |
| **Muestras HTML SEO Programático (`45` páginas)** | `seo_samples/` (`ev_9afb9a36...`, `0 KB` JS inline) | `4,428,752` | `e552467bb86b1dc2c3c1ff4dbdfa0dd97bd3d4089c088649add194a2b07db3f2` |
| **Captura HAR Pura API Sanitizada (`403` llamadas)** | `scoutpicks_api_only.har` (`ev_03f837b1...`) | `5,299,771` | `cf7b7263b3f1f0fc06c73a5e931dd1a9a98c70ae388ee1104d782a7a4a131e92` |
| **Captura HAR Multi-Origen Sanitizada (`2,340` llamadas)** | `scoutpicks_sanitized.har` (`ev_8d1fa222...`) | `22,802,344` | `c531673dbcb1ba0f4bb4e0fc99029a79229c81850d82ed335527c4c290a8d2a6` |

---

## 3. Resumen Maestro de los `53` `evidence_id` Únicos de REA (Olas 1 + 2)

El registro íntegro de los **`53` `evidence_id`** (`29` de Ola 1 + `24` de Ola 2) se encuentra en [rea-evidence-ledger.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/scoutpicks/evidence/rea-evidence-ledger.json) y [rea-wave2-evidence-ledger-summary.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/scoutpicks/evidence/rea/rea-wave2-evidence-ledger-summary.json).

### 3.1 Hitos Principales de la Ola 1 (`29` registros)
- **Observación CDP y exportación de Builds 1 y 2 (`15` registros):** `ev_eb381a14...`, `ev_036f5035...`, `ev_a8cc2cac...` (`inspect_web_page`); `ev_abdb3cf1...` y `ev_d6aea026...` (`export_web_scripts`); `ev_6d836a06...` y `ev_da106603...` (`capture_web_screenshot`); `ev_12af5668...`, `ev_b6a4cee9...`, `ev_c070dbad...` y `ev_a8f2daa8...` (`analyze_web_bundle`).
- **Análisis estático Astro y monolito CLI (`5` registros):** `ev_74b541a5...`, `ev_2042082f...`, `ev_4a13ea90...` (Astro 100% completo) y `ev_a394dec9...` / `ev_4ff9ca99...` (cota de 300s sobre el monolito único de `3.36 MB`).
- **HAR y síntesis `AgentEnv` (`9` registros):** `ev_8d1fa222...` (`2,340` peticiones), `ev_03f837b1...` (`403` llamadas API), `ev_ed3088de...` (`api-surface`), `ev_7aae1b8f...` (`environment-manifest`, `50` herramientas), `ev_4d363865...` (`environment-coverage`, `40` *state-backed* + `10` *recorded*) y `ev_fb68f72c...` / `ev_252a4bf2...` (`export_environment_bundle` `dry_run: true`).

### 3.2 Hitos Principales de la Ola 2 (`24` nuevos registros)

| `evidence_id` | Operación REA | Confianza / Autoridad | Hallazgo de Ola 2 Respaldado |
|---|---|---|---|
| `ev_0fb357d4a1453d5471dc808a4f58ca40c99849c2e422e22cda01df49487dad6d` | `analyze_javascript_application` | `derived` / `shipped-artifact` | Análisis AST **sin fallos (`0` `parse_failures`, `314,226` nodos AST, `955` hallazgos)** de los `18` módulos *first-party* (`1.32 MB`). |
| `ev_2ba4fc93becc9afbb1fd0fb0862986cb06588ecc636243b71f721af68fbff515` | `analyze_javascript_application` | `derived` / `shipped-artifact` | Grafo semántico íntegro (`source_paths`) para `mod_10..mod_14` y `mod_16` (`121,779` nodos AST, `80,293` relaciones `data-flow`). |
| `ev_3ccc9da78405000164ac83ee66d1029e7951de658fc484c5ab9765b0a4b58055` | `analyze_javascript_application` | `derived` / `shipped-artifact` | Grafo semántico íntegro para `mod_15_creator_pick_calendar_and_profile.js` (`23,382` nodos AST), cerrando **`18/18` (`100%`) módulos sin truncamiento**. |
| `ev_0eb9279cfa7e2970ad6feec84923b3cdd551b1ac00b55b0058a723d6bd904ceb` | `analyze_javascript_application` | `derived` / `shipped-artifact` | Análisis **100% completo** de los **10 chunks lazy i18n** (`1.04 MB`, `75,248` nodos AST, `50,362` relaciones semánticas). |
| `ev_7b3edd41edd5c3d249236f152e12fb9f1909c8c6e6cf5fba5d13883cdae79504` | `inspect_analysis_view` (`javascript-routes`) | `derived` / `shipped-artifact` | Extracción formal de las `18` rutas de pantalla de TanStack Router en `mod_17`. |
| `ev_d70f42bfeb67cdf4f433726f0e07944120ee929eef854a2ad7084ba48a968128` | `inspect_analysis_view` (`javascript-facts`) | `derived` / `shipped-artifact` | `999` hechos estructurales estáticos (endpoints, sinks `localStorage`, `dynamic-import` de locales). |
| `ev_90b1af38...`, `ev_0d526b81...`, `ev_a7aa14de...`, `ev_d3f533ae...`, `ev_5fe2335a...`, `ev_ac446d6d...` | `trace_javascript_semantics` (`6` trazas) | `inferred` / `analyst-inference` | Trazas `backward-provenance` sobre `opponentMetricRank`, `expectedLineupStatus` (`8` sitios), `togglePick` (`5` sitios), `canManagePickCalendar`, `freeLeagueId` y `onboardingV2`. |
| `ev_9afb9a36732e3300accd2b8f883a71df7237be8d90d98f9704980890984abfb0` | `analyze_javascript_application` | `derived` / `shipped-artifact` | Prueba formal sobre `45` páginas HTML de SEO programático (`4.43 MB`): **`0` scripts JS ejecutables inline** (`ev_5479d706...`). |
| `ev_11901b4af84b37db9b0fc563415c1b6cfdfa4a06192bf99ed58009d3c6cf1a37` + `ev_3b9c90fb...` | `inspect_web_page` + `export_web_scripts` | `observed` / `derived` | Captura y exportación verificada del **Build 4** (`index-DyN-BnCU.js`, `3,367,067` B, SHA-256 `d0f001bc...`) y persistencia de `sp_web_offer`. |

*(Los resúmenes proyectados intermedios `ev_26b6181d...`, `ev_526e3839...`, `ev_8f1c5653...`, `ev_542ac53c...`, `ev_bdeaa5cd...`, `ev_15467abe...`, `ev_35a49a88...` y `ev_d0465c84...` están documentados individualmente en [rea-evidence-ledger.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/scoutpicks/evidence/rea-evidence-ledger.json)).*

---

## 4. Qué Quedó Resuelto en Ola 2 vs Fronteras Estructurales del Servidor

1. **Resueltos al 100% en Ola 2 (antes pendientes o parciales en Ola 1):**
   - Timeout de 300s del analizador AST sobre el monolito de `3.36 MB` → **Resuelto al 100%** (`18/18` módulos + `10/10` chunks lazy con `0` `parse_failures` y `303,810` relaciones `JSRG`).
   - Dudas sobre compra de `xG` en ligas europeas top → **Resuelto al 100%** (`0 / 2,244` filas `PlayerStat` y `0 / 104` `TeamStat` tienen `xg != null` en Premier League, Champions, LaLiga, Liga MX y Libertadores).
   - Origen de `relevanceScore` y `powerPriority` → **Resuelto con precisión IEEE-754 (`8.53e-14`)** (`fifa_national` con denominador `57107` $\equiv 1142.14$ pts FIFA + `sportmonks_club` centesimal + bono `+25` en torneos continentales de selecciones).
   - Calibración real post-partido → **Resuelta mediante backtest *point-in-time* en 5 ligas (`562` picks liquidados: `51.42%` WR, `-21.68%` ROI, `-25.25%` ROI en Liga MX)**.
   - Fábrica SEO de 55 sitemaps (`81,197` URLs), `/.well-known/*`, `crt.sh` y descargas reales en Google Play (`90,412` instalaciones exactas) → **Auditados íntegramente**.
2. **Únicos elementos opacos por residir exclusivamente dentro del contenedor privado detrás del ALB de AWS (`[DESCONOCIDO]`):**
   - El tipo exacto de cómputo AWS tras `scoutpicks-api-343470550.us-east-1.elb.amazonaws.com` (ECS Fargate vs EC2), el identificador exacto del proveedor/modelo LLM invocado por `POST /market-alerts/assistant`, y el reparto individual dentro de los `9` pares disjuntos de clubes de Liga MX en `sportmonks_club` (`1` grado de libertad por par porque `/teams/:id` no expone la columna privada `rankingScore`).
