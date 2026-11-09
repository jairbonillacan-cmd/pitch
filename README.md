# PitchLab — Dossier de Ingeniería Inversa de Statiskicks (`REA-stats` · Wave 1 + Wave 2 + Wave 3)

> **Rama huérfana y worktree aislado** (`.worktrees/REA-stats`, rama `REA-stats`) dedicado a la ingeniería inversa integral de [`https://www.statiskicks.com/`](https://www.statiskicks.com/) mediante **REA (`Reverse-Engineer-Anything` MCP — 65 registros `ev_*` retenidos + 2 `ev_*` de exportación `AgentEnv`, y 4 incógnitas formales `unk_*` con 8 revisiones: 1 resuelta/verificada `valid: true, truthVerified: true` y 3 abiertas de severidad `low`)** y un equipo de subagentes especializados (**Gemini 4 Argon High**) a lo largo de **3 Olas de Profundidad (Wave 1 + Wave 2 + Wave 3)**. No comparte historial ni archivos con `feat/pre-mvp` ni `main`.

---

## 1. Índice Maestro de Informes (`reports/`)

| # | Informe | Contenido Principal |
|---|---|---|
| **01** | [01-executive-summary.md](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/reports/01-executive-summary.md) | **Resumen Ejecutivo y Veredicto Forense (Wave 1 + Wave 2 + Wave 3):** Stack tecnológico confirmado (**Laravel 12.x** con healthcheck `GET /up` y `@tailwindcss/browser@4` + **Blade SSR** + **Livewire v3 `release: a-a-a`** en `/livewire-e3175f40/update` + **Alpine.js v3** + **Bootstrap 5.3.3** + **Chart.js 4.4.3**), arquitectura híbrida SSR + Islands, los **26 motores JavaScript propietarios** (24 externos en `/custom_assets/js/*.js` + `04b-messi-full-block-6.js` de `215.8 KB` + `07-players-wire-script-0.js` de `63.3 KB`), las 15 hojas CSS externas + 4 inline, la **Piedra Rosetta de Tres Proveedores** (**Stats Perform / Opta SDAPI** + **API-Football / `api-sports.io`** + **FotMob CDN / `images.fotmob.com`**) y el catálogo de **40 ligas (9 gratuitas `Fan` vs 31 bloqueadas `Plus` a `\$129 MXN/mes`)**. |
| **02** | [02-architecture-and-routing.md](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/reports/02-architecture-and-routing.md) | **Arquitectura, Enrutamiento, Pestañas, Gating SSR y Livewire:** Infraestructura HTTP (`Apache/2.4.66 (Ubuntu)`, `GET /up`, `GET /robots.txt`, `GET /sitemap.xml`), mapa completo de las **17 rutas web e infraestructura**, bloqueo SSR `<section class="league-locked sk-card">` en las 31 ligas Plus (`/league/7ut48s80k421xixh6ev5i6h62`), todas las pestañas de partido, liga, equipo (con Islands `squad` y `results`), jugador (con Island `matches`, pestañas `Desempeño`, `Ranking`, `Comparar` y modal `#playerAutoReportModal`), modo claro (`[data-theme="light"]`) y vista móvil (`390×844`). |
| **03** | [03-javascript-and-components.md](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/reports/03-javascript-and-components.md) | **26 Motores JavaScript (`04b-messi-full-block-6.js` + `07-players-wire-script-0.js`), Algoritmos y 15 Hojas CSS:** Análisis forense línea por línea de los 28 scripts externos (`export_web_scripts`) y los 24 bloques inline/wire por página auditados con `analyze_javascript_application` sobre **85 archivos JS** (`ev_9e16df56...`, `ev_8ebf258a...` y `ev_6f32762b...`), incluyendo la deconstrucción completa de `playersFilterDraft` en [07-players-wire-script-0.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/inline-pages/07-players-wire-script-0.js) (`63,346 B`) y las **15 hojas CSS externas**. |
| **04** | [04-network-and-data-provenance.md](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/reports/04-network-and-data-provenance.md) | **Tráfico de Red, Esquemas RPC `[OBSERVADO]` y Piedra Rosetta de Tres Proveedores (`Data Provenance`):** Reconciliación exacta entre **Stats Perform (Opta SDAPI)** (UUIDs base-36 de 25 chars), **API-Football (`media.api-sports.io`)** (IDs numéricos) y **FotMob CDN (`images.fotmob.com`)**, tabla completa de las **40 ligas** ([rosetta-40-leagues-opta-apifootball.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/rosetta-40-leagues-opta-apifootball.json)), catálogo de **177 métricas Opta** ([rosetta-177-opta-attributes-catalog.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/rosetta-177-opta-attributes-catalog.json)) y todos los contratos RPC Livewire. |
| **05** | [05-evidence-register.md](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/reports/05-evidence-register.md) | **Registro de Evidencias REA (`65 ev_*` + 2 `AgentEnv`), Incógnitas Formales (`4 unk_*`, 8 revisiones) y Bundle `AgentEnv` (`413 archivos`, `106.9 MB`):** Catálogo completo de las **65 evidencias retenidas** en [rea-evidence-summary.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/rea-evidence-summary.json), las **4 incógnitas formales** en [rea-unknowns.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/rea-unknowns.json) (`unk_c7104fcac7a6781cc23c6d1216a43d4cc6e1e384c408bca299be9c4270d61191` resuelta y verificada) y el paquete reproducible [agentenv-statiskicks](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/agentenv-statiskicks/README.md). |

---

## 2. Estructura de Evidencias (`evidence/`)

```text
.worktrees/REA-stats/
├── README.md                                  # Este índice maestro (Wave 1 + Wave 2 + Wave 3)
├── reports/                                   # Los 5 informes técnicos forenses (Waves 1–3)
│   ├── 01-executive-summary.md
│   ├── 02-architecture-and-routing.md
│   ├── 03-javascript-and-components.md
│   ├── 04-network-and-data-provenance.md
│   └── 05-evidence-register.md
├── evidence/                                  # 413 artefactos verificados (106,911,735 bytes / 106.9 MB)
│   ├── rea-evidence-summary.json              # Resumen canónico de las 65 evidencias ev_* retenidas
│   ├── rea-unknowns.json                      # Ledger formal de las 4 incógnitas unk_* (8 revisiones: 1 resuelta + 3 open low)
│   ├── artifact-sha256-inventory.json         # Inventario criptográfico SHA-256 de artefactos
│   ├── agentenv-statiskicks/                  # Entorno reproducible REA AgentEnv (rea-agents@6.8.0)
│   │   ├── README.md                          # Provenance (ev_2a416540... y ev_eaecbc89...) e instrucciones
│   │   ├── envs/statiskicks-web-env/          # Dockerfile, env.toml y manifest.json (75,472 B)
│   │   ├── artifacts/check_statiskicks-web-env/verify.py
│   │   └── tasks/smoke.json
│   ├── captures/                              # 144 snapshots DOM HTML y capturas de los 32 escenarios REA
│   ├── javascript/
│   │   ├── home-scripts/                      # Salida directa de REA export_web_scripts (28 bundles)
│   │   ├── named/                             # Los 28 scripts externos con su nombre original
│   │   ├── inline-pages/                      # 24 bloques JS inline/wire (incl. 04b-messi-full-block-6.js y 07-players-wire-script-0.js)
│   │   ├── scripts-index.json                 # Mapeo SHA-256 y URL de cada script
│   │   └── inline-home-scripts.js             # 37 bloques <script> inline extraídos del Home
│   ├── css/                                   # Las 15 hojas de estilo externas + 4 bloques inline-pages/
│   ├── network-schemas/                       # 126 archivos JSON/TXT: Rosetta (40 ligas, 177 atributos), RPCs Livewire y /up
│   └── screenshots/                           # 30 capturas PNG de todas las vistas, pestañas, modales, ligas bloqueadas y móvil
└── tools/                                     # Scripts reproducibles de extracción, Rosetta e inventario SHA-256
```

---

## 3. Síntesis Rápida de Hallazgos (Waves 1 + 2 + 3)

1. **¿Cómo opera Statiskicks?**
   Es un monolito híbrido en **Laravel 12.x** (confirmado por el healthcheck nativo `GET /up` con `@tailwindcss/browser@4`) con **Blade SSR**, **Livewire v3 (`release: a-a-a`, `/livewire-e3175f40/update`)**, **Alpine.js v3**, **Bootstrap 5.3.3** y **Chart.js 4.4.3**. La primera carga entrega el HTML renderizado con bloques JSON precalculados en etiquetas `<script type="application/json">`, atributos `wire:snapshot` y scripts inyectados vía `wire:effects.scripts`, o dispara llamadas diferidas `POST /livewire-e3175f40/update` e Islands (`__lazyLoadIsland`). Los **26 motores JS propietarios** (24 módulos externos en `/custom_assets/js/*.js` + [04b-messi-full-block-6.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/inline-pages/04b-messi-full-block-6.js) de `215.8 KB` en `/player` + [07-players-wire-script-0.js](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/javascript/inline-pages/07-players-wire-script-0.js) de `63.3 KB` en `/players`) escuchan los eventos Livewire y renderizan las visualizaciones sobre `<canvas>` y `<svg>`.

2. **¿De dónde obtiene los datos? (Piedra Rosetta de Tres Proveedores — `unk_c7104fcac7a6781cc23c6d1216a43d4cc6e1e384c408bca299be9c4270d61191` Resuelta y Verificada):**
   - **Proveedor Primario de Estadísticas y Eventos (100% verificado):** **Stats Perform / Opta SDAPI**. Todas las entidades internas usan `opta_id` de 25 caracteres base-36 (ej. Liga MX = `2hsidwomhjsaaytdy9u5niyi4`, Liga MX Femenil = `7ut48s80k421xixh6ev5i6h62`, Club América = `eu8c408f59yx7egaqossbv25e`, Lionel Messi = `c5ryhn04g9goikd0blmh83aol`, Luis Malagón = `a1qs3b34p5u2s6mmlhdkgdp7t`, Keylor Navas = `9sme7jykdv8msgfu0nxx6h39x`), coordenadas estándar Opta `0..100` (eje Y de portería `44.2..55.8`, eje Z `0..38.0`), y una capa de servicios en Laravel bajo `App\Services\Opta\*`.
   - **Proveedor Secundario de Media e Identificadores Visuales (100% verificado):** **API-Football (`api-sports.io`)**. Los logos de las 40 ligas y escudos de equipos se almacenan en `/storage/media/leagues/{id}.png` y `/storage/media/teams/{id}.png` usando el ID numérico de API-Football (`262` = Liga MX, `2287` = Club América), y las fotografías de jugadores se sirven desde `https://media.api-sports.io/football/players/{id}.png`.
   - **Proveedor Terciario de Avatares y Referencia UI (100% verificado):** **FotMob CDN (`images.fotmob.com`)**, utilizado como fallback de avatares de jugadores (`https://images.fotmob.com/image_resources/playerimages/{id}.png` en `GET /players/search?q=cristiano` y `GET /search`) y citado explícitamente en los comentarios de `player-heat.js`.

3. **¿Cómo funciona el catálogo de 40 ligas y el paywall Plus (`\$129 MXN/mes`)?**
   De las **40 competiciones** registradas en [rosetta-40-leagues-opta-apifootball.json](file:///c:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/REA-stats/evidence/network-schemas/rosetta-40-leagues-opta-apifootball.json), **9 ligas** están abiertas en el plan gratuito `Fan` (`is_scout: true`: Liga MX, Premier League, LaLiga, Serie A, Bundesliga, Ligue 1, Argentina, Brasileirão y MLS) y **31 ligas/copas** están bloqueadas para suscriptores `Plus` (`is_scout: false`), protegidas en servidor mediante renderizado condicional `<section class="league-locked sk-card">`.
