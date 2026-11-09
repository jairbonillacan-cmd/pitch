# PitchLab — Dossier de Ingeniería Inversa de Statiskicks (`REA-stats`)

> **Rama huérfana y worktree aislado** (`.worktrees/REA-stats`, rama `REA-stats`) dedicado a la ingeniería inversa integral de [`https://www.statiskicks.com/`](https://www.statiskicks.com/) mediante **REA (`Reverse-Engineer-Anything` MCP)** y un equipo de subagentes especializados. No comparte historial ni archivos con `feat/pre-mvp` ni `main`.

---

## 1. Índice Maestro de Informes (`reports/`)

| # | Informe | Contenido Principal |
|---|---|---|
| **01** | [`reports/01-executive-summary.md`](reports/01-executive-summary.md) | **Resumen Ejecutivo y Hallazgos Clave:** Stack tecnológico confirmado (`Laravel + Blade SSR + Livewire v3/v4 + Bootstrap 5.3.3 + Chart.js 4.4.3`), arquitectura híbrida SSR + Islands, los 24 motores de visualización en JavaScript sin minificar, origen exacto de datos (**Stats Perform / Opta SDAPI** + **API-Football / `api-sports.io`**) y modelo de freemium/suscripción Pro (`\$90 MXN/mes`). |
| **02** | [`reports/02-architecture-and-routing.md`](reports/02-architecture-and-routing.md) | **Arquitectura, Enrutamiento y Livewire:** Infraestructura HTTP (`Apache/2.4.66 (Ubuntu)`), cookies de sesión y CSRF (`XSRF-TOKEN`, `statiskicks_session`), mapa completo de rutas y slugs con sufijos Base62 de 4 caracteres, protocolo `POST /livewire-e3175f40/update`, anatomía de los 12 componentes Livewire (`wire:snapshot`), y flujo de búsqueda en vivo (`GET /search?q=`). |
| **03** | [`reports/03-javascript-and-components.md`](reports/03-javascript-and-components.md) | **Motores JavaScript, Algoritmos y Componentes UI:** Análisis forense línea por línea de los 28 scripts extraídos con REA (`export_web_scripts`) y auditados con `analyze_javascript_application` e `inspect_analysis_view`. Documenta las fórmulas de `skore.js` (rating bayesiano `1.0–10.0`), `event-map.js` (pitch Opta `105×68`), `goalmouth-map.js` (`y: 44.2..55.8`, `z: 0..38`), `heatmap.js` (KDE Gaussiano + Marching Squares), `player-heat.js` (grilla `16×12`), `team-pass-network.js`, `league-maps.js`, `attribute-charts.js`, `percentile-rows.js`, `chart-download.js` y `download-paywall.js`. |
| **04** | [`reports/04-network-and-data-provenance.md`](reports/04-network-and-data-provenance.md) | **Tráfico de Red, Esquemas JSON y Origen de los Datos (Data Provenance):** Pruebas irrefutables de que el proveedor primario de eventos, coordenadas y métricas xG/xGOT/xT es **Stats Perform (Opta SDAPI)** (UUIDs alfanuméricos de 25 caracteres en base-36, coordenadas `0..100`, y servicios internos `App\Services\Opta\*` filtrados en errores de consola) y que el proveedor secundario de fotos y escudos es **API-Football (`media.api-sports.io`)**. |
| **05** | [`reports/05-evidence-register.md`](reports/05-evidence-register.md) | **Registro de Evidencias REA (`ev_*`) e Inventario SHA-256:** Catálogo completo de las **26 operaciones REA** ejecutadas (`capture_browser_scenario`, `export_web_scripts`, `analyze_javascript_application`, `inspect_analysis_view`, `trace_application_feature`, `export_evidence_bundle`), mapeo de los 28 scripts aislados y tabla de verificación SHA-256. |

---

## 2. Estructura de Evidencias (`evidence/`)

```text
.worktrees/REA-stats/
├── README.md                                  # Este índice maestro
├── reports/                                   # Los 5 informes técnicos forenses
│   ├── 01-executive-summary.md
│   ├── 02-architecture-and-routing.md
│   ├── 03-javascript-and-components.md
│   ├── 04-network-and-data-provenance.md
│   └── 05-evidence-register.md
├── evidence/
│   ├── rea-evidence-summary.json              # Resumen de las 26 evidencias ev_* del ledger REA
│   ├── rea-evidence-bundle.json               # Bundle completo exportado por REA (247.8 MB, local)
│   ├── artifact-sha256-inventory.json         # Inventario SHA-256 de los 160 artefactos extraídos
│   ├── captures/                              # 19 snapshots DOM HTML + capturas de escenarios REA
│   ├── javascript/
│   │   ├── home-scripts/                      # Salida directa de REA export_web_scripts (28 bundles)
│   │   ├── named/                             # Los 28 scripts renombrados con su nombre original
│   │   ├── scripts-index.json                 # Mapeo SHA-256 y URL de cada script
│   │   └── inline-home-scripts.js             # 37 bloques <script> inline extraídos del DOM
│   ├── css/                                   # 5 hojas de estilo (app.css, bootstrap, etc.)
│   ├── network-schemas/                       # Payloads JSON, wire:snapshot, /livewire/update y /search
│   └── screenshots/                           # 13 capturas PNG de todas las vistas y pestañas
└── tools/                                     # Scripts auxiliares de extracción e inventario
```

---

## 3. Resumen Rápido de Hallazgos

1. **¿Cómo opera Statiskicks?**
   Es un monolito moderno en **Laravel (PHP 8.x)** con **Blade SSR** y **Livewire** (`/livewire-e3175f40/livewire.min.js?id=6b3709b1`). La primera carga de cada ruta (`/`, `/league/{slug}`, `/team/{slug}`, `/player/{slug}`, `/match/{slug}`) entrega el HTML renderizado con bloques JSON precalculados en etiquetas `<script type="application/json">` y atributos `wire:snapshot`. Cuando el usuario cambia de pestaña (*Tiros*, *Pases*, *Redes de pase*, * Flujo xG*, *Comparación*), Livewire envía un `POST /livewire-e3175f40/update` y actualiza solo la isla DOM (`<!--[if ENDBLOCK]><![endif]-->`), mientras que los motores JS en `/custom_assets/js/*.js` detectan los nuevos nodos con `MutationObserver` y redibujan los `<canvas>` e `<svg>`.

2. **¿De dónde obtiene los datos?**
   - **Proveedor Primario de Estadísticas y Eventos (100% verificado):** **Stats Perform / Opta SDAPI**. Todas las entidades internas usan `opta_id` de 24–25 caracteres base-36 (ej. Liga MX = `2hsidwomhjsaaytdy9u5niyi4`, Club América = `eu8c408f59yx7egaqossbv25e`, Lionel Messi = `c5ryhn04g9goikd0blmh83aol`), coordenadas estándar Opta `0..100` (eje Y de portería `44.2..55.8`), y una capa de servicios en Laravel bajo el namespace `App\Services\Opta\*` (`OptaMatchRatingService`, `OptaSeasonStatsService`, `OptaTeamAttributeService`, `OptaKeeperGoalmouthService`, `OptaEventMapBuilder`, `OptaZoneControl`, `OptaTeamXgTimelineService`).
   - **Proveedor Secundario de Media e Identificadores Visuales (100% verificado):** **API-Football (`api-sports.io`)**. Las fotografías de jugadores se sirven directamente desde `https://media.api-sports.io/football/players/{id}.png` y los escudos de ligas/equipos se almacenan localmente en `/storage/media/leagues/{id}.png` y `/storage/media/teams/{id}.png` usando los IDs enteros de API-Football (`262` = Liga MX, `2287` = Club América).
