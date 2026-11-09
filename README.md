# PitchLab — Dossier de Ingeniería Inversa de Statiskicks (`REA-stats` · Wave 1 + Wave 2)

> **Rama huérfana y worktree aislado** (`.worktrees/REA-stats`, rama `REA-stats`) dedicado a la ingeniería inversa integral de [`https://www.statiskicks.com/`](https://www.statiskicks.com/) mediante **REA (`Reverse-Engineer-Anything` MCP — 50 registros `ev_*` y 3 incógnitas formales `unk_*`)** y un equipo de subagentes especializados (**Gemini 4 Argon High**). No comparte historial ni archivos con `feat/pre-mvp` ni `main`.

---

## 1. Índice Maestro de Informes (`reports/`)

| # | Informe | Contenido Principal |
|---|---|---|
| **01** | [`reports/01-executive-summary.md`](reports/01-executive-summary.md) | **Resumen Ejecutivo y Veredicto Forense (Wave 1 + Wave 2):** Stack tecnológico confirmado (`Laravel + Blade SSR + Livewire v3/v4 + Bootstrap 5.3.3 + Chart.js 4.4.3`), arquitectura híbrida SSR + Islands, los 24 motores externos en JavaScript sin minificar + el motor inline oculto de `215.8 KB` en `/player/{id}/{slug}`, las 15 hojas de estilo CSS externas, origen exacto de datos (**Stats Perform / Opta SDAPI** + **API-Football / `api-sports.io`** + **Google OAuth 2.0**) y modelo freemium Plus (`\$129 MXN/mes` / `\$774 MXN/año`). |
| **02** | [`reports/02-architecture-and-routing.md`](reports/02-architecture-and-routing.md) | **Arquitectura, Enrutamiento, Pestañas y Livewire:** Infraestructura HTTP (`Apache/2.4.66 (Ubuntu)`), mapa completo de las **14 rutas web** (incluyendo `/contacto`, `/privacidad`, `/terminos`, `/forgot-password` y redirección `GET /auth/google/redirect`), todas las pestañas de partido (`alineaciones`, `estadisticas`, `eventos`, `datos`, `lideres`, `tabla`, `cara-a-cara` + modal de portero `Portería`), de liga (`leaders`, `standings`, `results`, `calendar`, `stats`, `projection`, `maps`, `scatter`, `scout-ratings`), de jugador (de campo y portero) y del explorador (`/players` modos `Jugadores` y `Equipos`). |
| **03** | [`reports/03-javascript-and-components.md`](reports/03-javascript-and-components.md) | **Motores JavaScript, Motor Inline de `215 KB`, Algoritmos y 15 Hojas CSS:** Análisis forense línea por línea de los 28 scripts externos (`export_web_scripts`) + los 21 bloques inline por página (`04b-messi-full-block-6.js`, `215,827 B`) auditados con `analyze_javascript_application` (`ev_9e16df56...` y `ev_8ebf258a...`), junto con la arquitectura completa de las **15 hojas CSS externas** (`sk.css`, `match-detail.css`, `league-detail.css`, etc.). |
| **04** | [`reports/04-network-and-data-provenance.md`](reports/04-network-and-data-provenance.md) | **Tráfico de Red, Esquemas RPC `[OBSERVADO]` y Origen de los Datos (Data Provenance):** Pruebas irrefutables de **Stats Perform (Opta SDAPI)** + **API-Football (`media.api-sports.io`)**, catálogo de 40 ligas, 171 traits de equipo, 147 traits de jugador de campo y 6 ejes de portero, más esquemas `[OBSERVADO]` de todos los RPCs Livewire (`keeperGoalmouth`, `loadMapGraphData` con K-Means, `loadSimilarPlayersData`, `ensureComparisonDataLoaded`, `loadTeamFormationProfile`, perfil de portero de Luis Malagón y `GET /players/search`). |
| **05** | [`reports/05-evidence-register.md`](reports/05-evidence-register.md) | **Registro de Evidencias REA (`50 ev_*`), Incógnitas Formales (`3 unk_*`) e Inventario SHA-256 (`355 archivos`):** Catálogo completo de las **50 operaciones REA**, las **3 incógnitas residuales formales** (`record_unknown`) y el inventario criptográfico SHA-256 de los `94.6 MB` de artefactos versionados. |

---

## 2. Estructura de Evidencias (`evidence/`)

```text
.worktrees/REA-stats/
├── README.md                                  # Este índice maestro
├── reports/                                   # Los 5 informes técnicos forenses (Wave 1 + Wave 2)
│   ├── 01-executive-summary.md
│   ├── 02-architecture-and-routing.md
│   ├── 03-javascript-and-components.md
│   ├── 04-network-and-data-provenance.md
│   └── 05-evidence-register.md
├── evidence/
│   ├── rea-evidence-summary.json              # Resumen de las 50 evidencias ev_* del ledger REA
│   ├── rea-unknowns.json                      # Ledger formal de las 3 incógnitas residuales unk_*
│   ├── rea-evidence-bundle.json               # Bundle determinista REA (340.2 MB, local gitignored)
│   ├── artifact-sha256-inventory.json         # Inventario SHA-256 de los 355 artefactos versionados (94.6 MB)
│   ├── captures/                              # Snapshots DOM HTML y capturas de 28 escenarios REA
│   ├── javascript/
│   │   ├── home-scripts/                      # Salida directa de REA export_web_scripts (28 bundles)
│   │   ├── named/                             # Los 28 scripts externos con su nombre original
│   │   ├── inline-pages/                      # 21 bloques JS inline por ruta (incl. 04b-messi-full-block-6.js de 215 KB)
│   │   ├── scripts-index.json                 # Mapeo SHA-256 y URL de cada script
│   │   └── inline-home-scripts.js             # 37 bloques <script> inline extraídos del Home
│   ├── css/                                   # Las 15 hojas de estilo externas + 4 bloques inline-pages/
│   ├── network-schemas/                       # Payloads JSON, wire:snapshot, respuestas RPC /livewire/update y /search
│   └── screenshots/                           # 25 capturas PNG de todas las vistas, pestañas y modales
└── tools/                                     # Scripts reproducibles de extracción e inventario SHA-256
```

---

## 3. Resumen Rápido de Hallazgos

1. **¿Cómo opera Statiskicks?**
   Es un monolito híbrido en **Laravel (PHP 8.x)** con **Blade SSR** y **Livewire** (`/livewire-e3175f40/livewire.min.js?id=6b3709b1`). La primera carga entrega el HTML renderizado con bloques JSON precalculados en etiquetas `<script type="application/json">` y atributos `wire:snapshot`, o dispara una secuencia diferida de llamadas `POST /livewire-e3175f40/update` (`loadTraitsData`, `loadRankingData`, `loadPerformanceSummaryData`, `loadHeatmapData`, `loadTeamFormationProfile`). Los 24 motores JS externos en `/custom_assets/js/*.js` más el motor inline de `215.8 KB` en `/player/{id}/{slug}` escuchan los eventos Livewire (`traits-data-updated`, `similar-players-data-updated`, `comparison-data-updated`, `keeper-goalmouth-loaded`, `team-formation-profile-updated`) y renderizan las visualizaciones sobre `<canvas>` y `<svg>`.

2. **¿De dónde obtiene los datos?**
   - **Proveedor Primario de Estadísticas y Eventos (100% verificado):** **Stats Perform / Opta SDAPI**. Todas las entidades internas usan `opta_id` de 24–25 caracteres base-36 (ej. Liga MX = `2hsidwomhjsaaytdy9u5niyi4`, Club América = `eu8c408f59yx7egaqossbv25e`, Lionel Messi = `c5ryhn04g9goikd0blmh83aol`, Luis Malagón = `a1qs3b34p5u2s6mmlhdkgdp7t`, Keylor Navas = `9sme7jykdv8msgfu0nxx6h39x`), coordenadas estándar Opta `0..100` (eje Y de portería `44.2..55.8`, eje Z `0..38.0`), y una capa de servicios en Laravel bajo `App\Services\Opta\*` (`OptaMatchRatingService`, `OptaSeasonStatsService`, `OptaTeamAttributeService`, `OptaKeeperGoalmouthService`, `OptaEventMapBuilder`, `OptaZoneControl`, `OptaTeamXgTimelineService`).
   - **Proveedor Secundario de Media e Identificadores Visuales (100% verificado):** **API-Football (`api-sports.io`)**. Las fotografías de jugadores se sirven directamente desde `https://media.api-sports.io/football/players/{id}.png` y los escudos de ligas/equipos se almacenan localmente en `/storage/media/leagues/{id}.png` y `/storage/media/teams/{id}.png` usando los IDs enteros de API-Football (`262` = Liga MX, `2287` = Club América).
