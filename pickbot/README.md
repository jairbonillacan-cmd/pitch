# PitchLab — Dossier de Ingeniería Inversa Integral de PickBot (`pickbot.mx` · REA Wave 1–4)

> **Dossier forense aislado** (`pickbot/` en el worktree `explore_pickbot_architecture`) dedicado a la ingeniería inversa integral de [`https://www.pickbot.mx/`](https://www.pickbot.mx/) (`deployment_id: dpl_7NUCdW69BaU9CMQePVhfQtRBwC3n`) mediante **REA (`Reverse-Engineer-Anything` MCP `rea-agents@6.8.0` — 49 registros `ev_*` retenidos + 2 `ev_*` de exportación `AgentEnv`, y 5 incógnitas formales `unk_*` con 6 revisiones: 1 resuelta y verificada `valid: true, truthVerified: true` + 4 abiertas de severidad `low`)** y recorrido interactivo autenticado de **solo lectura y cero-PII**. No modifica ningún archivo raíz del dossier previo `REA-stats`.

---

## 1. Índice Maestro de Informes (`pickbot/reports/`)

| # | Informe | Contenido Principal |
|---|---|---|
| **01** | [01-executive-summary.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/reports/01-executive-summary.md) | **Resumen Ejecutivo y Veredicto Forense Integral:** Arquitectura real de extremo a extremo (**Next.js App Router + Turbopack** en **Vercel `iad1`** + **Firebase Auth `pickbot-87e95`** + **MongoDB**), diagrama completo de proveedores (**The Odds API v4**, **OpenAI `openai_match_selection`**, **`ml-api` / `core_game_v1`**, **FlagCDN**, **Stripe Billing**), hallazgos de seguridad (gating de Pick Energy solo en cliente + paso de `uid`/`mongoUserId` sin `Bearer` token) y rentabilidad real (`4,517` picks, `-3.0%` ROI bruto explicado por sobreconfianza `>= 70%`). |
| **02** | [02-architecture-and-routing.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/reports/02-architecture-and-routing.md) | **Arquitectura Serverless, Enrutamiento Next.js, Identidad Dual y Economía de Pick Energy:** Cabeceras Vercel/RSC, mapa completo de las **24 rutas** (incluyendo la anomalía heredada `app/[conversationId]` donde `GET /robots.txt -> /picks`), sincronización Firebase ↔ MongoDB (`POST /api/auth/sync`, `GET /api/auth/me`), constantes exactas del módulo `32890` (`MAX_PICK_ENERGY = 5`, `REGEN_MS = 4h`, `MATCH_UNLOCK_COST = 1`, `BUILDER_COST = 2`, `INVITE_BONUS_ENERGY = 10`) y planes **Gratis (`\$0 MXN`)** vs **PickBot Pro (`\$299 MXN/mes`, `prod_U2enelHVVdr9L6`)**. |
| **03** | [03-javascript-and-components.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/reports/03-javascript-and-components.md) | **51 Chunks JavaScript, Grafo AST en REA (`217,257` Nodos AST), Algoritmos Cliente y 2 Hojas CSS:** Inventario SHA-256 completo de los **32 chunks propios** y **19 vendor/runtime** ([scripts-index.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/javascript/scripts-index.json)), tokens Tailwind CSS v4 ([ba18d09ff3b83e99.css](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/css/ba18d09ff3b83e99.css)), cascada `TeamAvatar` (FlagCDN + ~90 clubes + hash FNV-1a `0x811c9dc5` + luminancia WCAG), malla independiente de Poisson en cliente (`Mapa de marcadores`), inspector de **24+9 features ML**, temporizador simulado `2200 + 2800*t` y **6 testimonios fijos** en `/picks`, DSL de estrategias y tarjetas PNG con `modern-screenshot`. |
| **04** | [04-network-and-data-provenance.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/reports/04-network-and-data-provenance.md) | **Tráfico de Red, Procedencia de Datos (`Data Provenance`), 33 Deportes y Auditoría Financiera de 30 Ligas:** Pruebas directas en [19-api_match_ucl_galatasaray_aston_villa.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/network-schemas/19-api_match_ucl_galatasaray_aston_villa.json) (`odds.quota` de `100,000` créditos/mes en **The Odds API v4**, 6 casas US, TTL de `20 min`, `audit.created_from: "openai_match_selection"`, `prompt_version: "pickbot-structured-selection-v9"`), catálogo de **33 `SPORT_LABELS`**, tabla financiera íntegra de las **30 ligas** ([15-alltime-api_rendimiento_allTime_1_sportKey_all_strategyId_none.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/network-schemas/15-alltime-api_rendimiento_allTime_1_sportKey_all_strategyId_none.json)), curva de calibración y referencia de **30 endpoints `/api/*`**. |
| **05** | [05-evidence-register.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/reports/05-evidence-register.md) | **Registro Canónico de Evidencias REA (`49 ev_*` + `2 AgentEnv`), 5 Incógnitas `unk_*` y Entorno `pickbot-web-env`:** Tabla completa de los **49 registros `ev_*` retenidos** en [rea-evidence-summary.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/rea-evidence-summary.json), las **5 incógnitas `unk_*` (6 revisiones)** en [rea-unknowns.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/rea-unknowns.json), documentación del entorno reproducible [agentenv-pickbot](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/agentenv-pickbot/README.md) (`21` herramientas MCP activas), protocolo cero-PII e inventario SHA-256 ([artifact-sha256-inventory.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/artifact-sha256-inventory.json)). |

---

## 2. Estructura del Dossier (`pickbot/`)

```text
pickbot/
├── README.md                                       # Este índice maestro del dossier PickBot
├── reports/                                        # Los 5 informes técnicos forenses en español
│   ├── 01-executive-summary.md
│   ├── 02-architecture-and-routing.md
│   ├── 03-javascript-and-components.md
│   ├── 04-network-and-data-provenance.md
│   └── 05-evidence-register.md
├── evidence/                                       # 171 artefactos verificados por SHA-256 (58.56 MB)
│   ├── rea-evidence-summary.json                   # Resumen canónico de los 49 registros ev_* retenidos
│   ├── rea-unknowns.json                           # Ledger formal de las 5 incógnitas unk_* (6 revisiones)
│   ├── artifact-sha256-inventory.json              # Firmas SHA-256 de todos los artefactos bajo evidence/
│   ├── agentenv-pickbot/                           # Entorno MCP reproducible REA AgentEnv (rea-agents@6.8.0)
│   │   ├── README.md                               # Provenance (ev_25553733... y ev_75a17939...) e instrucciones
│   │   ├── envs/pickbot-web-env/                   # Dockerfile, env.toml, manifest.json y evidence.json
│   │   ├── artifacts/check_pickbot-web-env/verify.py
│   │   └── tasks/smoke.json
│   ├── captures/                                   # 39 capturas REA Playwright, DOM HTML, HAR redactado y vistas AST
│   ├── javascript/
│   │   ├── home-scripts/                           # Salida directa de REA export_web_scripts (21 scripts iniciales)
│   │   ├── route-chunks/                           # Los 51 chunks .js completos de Next.js/Turbopack
│   │   └── scripts-index.json                      # Clasificación first-party (32) vs vendor (19) y hashes SHA-256
│   ├── css/                                        # Las 2 hojas CSS (Tailwind v4 oscuro + Inter local)
│   ├── network-schemas/                            # 27 payloads JSON/CSV puros (partidos, rendimiento, estrategias, HAR)
│   └── screenshots/                                # 20 capturas visuales PNG verificadas cero-PII (01..20)
└── tools/                                          # Scripts reproducibles de extracción, inventario SHA-256 y auditoría cero-PII
```

---

## 3. Síntesis Rápida de Hallazgos Clave

1. **¿Cómo funciona realmente PickBot (`pickbot.mx`)?**
   Es una SPA/SSR en **Next.js App Router + Turbopack** alojada en **Vercel (`iad1`)** con **Firebase Auth (`pickbot-87e95`)** y **MongoDB**. Contrario a la impresión de que consulta una IA en vivo al abrir cada juego, un pipeline por lotes precalcula documentos `pick_set` por partido (`user_id: "system"`): primero un microservicio interno **`ml-api` (`core_game_v1`)** estima probabilidades calibradas sobre **24+9 features históricos** y corre **20,000 simulaciones Monte Carlo**; después **OpenAI (`openai_match_selection`, `pickbot-structured-selection-v9`)** redacta la lectura, condición de entrada y riesgos. En `/picks`, la barra de progreso de 7 pasos (`setTimeout(2200 + 2800 * t)`) y los 6 testimonios Pro son estáticos en el cliente mientras responde `POST /api/bets/build`.

2. **¿De dónde obtiene los datos deportivos, momios y escudos? (`unk_3c9b39a9...` Verificada `truthVerified: true`)**
   - **Calendario, marcadores y momios:** **The Odds API v4 (`the-odds-api.com`)**, confirmado de forma irrefutable por la filtración literal de `odds.quota` (`requests_remaining: "69471", requests_used: "30529"` = **plan de `100,000` créditos/mes**), `regions: "us"`, `odds_format: "american"`, TTL de caché de `20 minutos` y **6 casas estadounidenses** (`BetMGM`, `BetRivers`, `Bovada`, `DraftKings`, `Fanatics`, `FanDuel`).
   - **Banderas y escudos (`TeamAvatar`):** Como The Odds API no provee escudos de clubes, el módulo `44259` usa **FlagCDN (`flagcdn.com/w80/{iso}.png`)** para selecciones nacionales, una tabla curada de ~90 clubes y un hash **FNV-1a de 32 bits (`0x811c9dc5`)** a gradientes `hsl(...)` con contraste WCAG para el resto.
   - **Narrativa de picks:** **OpenAI API** (`audit.created_from: "openai_match_selection"`).

3. **¿Cómo funciona el candado de "Pick Energy" y la suscripción PickBot Pro (`\$299 MXN/mes`)?**
   El plan gratuito otorga `5` unidades máximas (`1` recarga cada `4 horas`, costo `1` por partido y `2` en el constructor `/picks`), mientras **PickBot Pro (`\$299 MXN/mes`, Stripe `prod_U2enelHVVdr9L6`)** desbloquea uso ilimitado en UI (`picksPerMonth: 250` en cuota interna) y modelos `["fast", "enhanced"]`. Sin embargo, **`GET /api/markets/matches/[eventId]?sportKey=...` no valida sesión ni desbloqueo en el servidor**: devuelve públicamente el `pick_set` completo (`bets`, tesis OpenAI y las `20,000` simulaciones), por lo que el bloqueo de Pick Energy en partidos opera únicamente en el cliente React.

4. **¿Cuál es su desempeño estadístico auditado (`4,517` picks)?**
   Sin filtros (`strategyId=none`), acumula `3,884` picks decididos (`2,204G - 1,680P - 89 Push`, `56.7%` acierto) con **`-3.0%` ROI (`-115.7u`)** debido a sobreconfianza severa en probabilidades predichas `>= 70%` (en `80–85%` predice `82.5%` y acierta `68.8%`). Destaca positivamente en **MLB (`+2.1%` ROI, `+30.03u` en `1,410` decididos)**, **World Cup (`+20.3%`)**, **MMA (`+22.2%`)**, **ATP US Open (`+8.3%`)** y **Premier League (`+5.4%`)**, razón por la cual la estrategia oficial `pickbot` filtra a `1.25 <= edge_pp <= 1.75`.
