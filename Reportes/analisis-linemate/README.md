# LineMate NFL Reverse Engineering & Architectural Blueprint for PitchLab
## Reportes de Análisis e Índice de Investigación

> **Fecha:** Noviembre 2026 · **Herramienta principal:** REA (*Reverse Engineer Anything*) + Playwright CDP + Análisis de API  
> **Directorio Local:** `Reportes/analisis-linemate/` y `research/linemate/`  
> **Proyecto Beneficiario:** PitchLab — Superapp de Inteligencia Deportiva  

---

## 1. Qué es Linemate

Plataforma freemium de investigación para apuestas deportivas (web + iOS + Android): tendencias de props ("Hit in 8 of last 10"), parlays, señales contextuales y odds de 30+ sportsbooks. Monetización: suscripción Linemate+ (Stripe/IAP) + afiliación de operadores (FirstPromoter, deep links) + publicidad regional.

---

## 2. Estructura de la Investigación en `Reportes/analisis-linemate/`

### Fase 1 — Cómo Opera (Análisis Operativo)
- [`FINDINGS.md`](FINDINGS.md) — arquitectura, modelo de datos, endpoints, monetización, compliance, telemetría, rutas.
- [`captures/`](captures) — capturas REA (Playwright) del landing, trends, login/pricing, perfil de jugador.
- [`app/`](app) — bundle `main.1f0201a8.js` y `config-v3.json` descargados (análisis estático).

### Fase 2 — Reconstrucción del Motor de Predicciones (Informes Técnicos)
| Informe | Contenido |
|---|---|
| [`REPORT-GLOBAL.md`](REPORT-GLOBAL.md) | **Informe maestro**: pipeline etapa por etapa, fórmulas confirmadas, validación numérica, frecuencia de actualización, trazabilidad (identificado/inferido/indeterminado), MLB (fuera de temporada) |
| [`REPORT-NFL.md`](REPORT-NFL.md) | NFL: fuentes (Sportradar/Sleeper), mercados, registro de mercados client-side, pruebas |
| [`REPORT-NBA.md`](REPORT-NBA.md) | NBA: mapeo de stats, validación 46/46 |
| [`REPORT-EPL.md`](REPORT-EPL.md) | Fútbol (StatsPerform/Opta): mapeo CARDS/SHOTS/TACKLES, validación 50/50 |
| [`REPORT-NHL.md`](REPORT-NHL.md) | NHL: mercados por periodo, porteros, validación 44/45 |

### Código (Motor Independiente + Validación)
- [`engine.py`](engine.py) — motor independiente: hit-rule, ventanas por señal, mapeo stat↔mercado NFL (player/team/injury/parlay).
- [`validate.py`](validate.py) — valida NFL contra la API en vivo (player + injury + team).
- [`validate_other.py`](validate_other.py) — valida NBA/NHL/EPL con sus mapeos.
- [`parlays.py`](parlays.py) — reproduce señales conjuntas de parlays.
- [`opp_rank.py`](opp_rank.py) — verificación de OPPONENT_RANK con positionalStats.
- [`hashid.py`](hashid.py) — intento documentado de invertir el hash de `trendId` (344 candidatos).
- [`recover.py`](recover.py) — re-descarga todos los payloads de referencia (genera `api/`).

### Evidencia Compacta
- [`api-snapshot2/`](api-snapshot2) — **segundo snapshot completo** (2026-11-08 19:2x UTC): NFL trends/games/rankings/injuries + NBA/EPL/NHL trends + lookup por trendId. Evidencia de que las fórmulas se mantienen entre snapshots.
- `api/` (fase 1, ya en el repo) — snapshot NFL completo del primer análisis.
- **No incluido en el repo**: los game logs crudos (~58 MB: `api/players*`, `api/teams`) — se regeneran con `python3 recover.py` en un directorio de trabajo (tarda ~1 min).

---

## 3. Resultados de Validación (Motor Independiente vs API en Vivo)

| Suite | Resultado |
|---|---|
| NFL player signals (2 snapshots independientes) | 112/112 counts exactos (97/112 con `average`; 15 divergencias = bug reproducible del API: `average:0.0` en HEAD_TO_HEAD) |
| NFL INJURY_IMPACT | 13/13 |
| NFL team trends (TOTAL/1H/1Q/ML/SPREAD) | 30/30 |
| Parlays NFL | 14/15 |
| NBA | 46/46 |
| NHL | 44/45 (1 edge case de portero) |
| EPL | 50/50 |
| **Total** | **310/312 señales reproducidas exactamente** |

---

## 4. Estructura Exhaustiva del Dossier en `research/linemate/`

```text
research/linemate/
├── README.md                           # Master index and investigation guide
├── executive-summary.md                # High-level synthesis, key findings, and PitchLab roadmap
├── page-inventory.md                   # Complete inventory of all application routes, views, and access tiers
├── navigation-and-routing.md           # Client routing architecture, path resolution, and tab state
├── frontend-analysis.md                # Component tree, state management, CSS architecture, and rendering
├── javascript-analysis.md              # Deobfuscated JS/TS source code analysis, bundle layout, and libraries
├── network-and-apis.md                 # Complete REST API catalog, endpoints, schemas, and query parameters
├── data-provenance.md                  # Upstream data sources (Sportradar, Sleeper, Kalshi) and provider IDs
├── nfl-data-model.md                   # Canonical entities: Player, Team, Game, CumulativeStats, Markets
├── historical-data.md                  # Depth of historical records, game logs, and temporal bounds
├── player-props.md                     # NFL player props catalog, lines, outcomes, and market levels
├── hit-rate-engine.md                  # Mathematical formulation of hit rates, pushes, and sample windows
├── workstation.md                      # Detailed analysis workstation: filters, splits, with/without teammate
├── game-logs.md                        # Historical boxscores, participation, cumulative stats, and sorting
├── player-profiles.md                  # Player profile architecture, active game bindings, and prop cards
├── matchups.md                         # Opponent analysis, defensive rankings allowed, and matchup grades
├── trends-engine.md                    # Straight and parlay trends algorithms, signal triggers, and heuristics
├── parlay-and-correlation.md           # SGP & Cross-Game parlay assembly, correlation analysis vs independence
├── sportsbook-coverage.md              # Integrated bookmakers, DFS platforms, prediction markets, and priority
├── odds-and-markets.md                 # Odds formats, vig removal, price comparison, and operator deep links
├── historical-odds.md                  # Historical odds tracking capabilities, line movement, and gaps
├── prediction-vs-trends.md             # Rigorous demarcation: Descriptive trends vs. Probabilistic models
├── auth-and-subscriptions.md           # Firebase Auth, Stripe billing, access levels (0-3), and feature gating
├── ux-and-design.md                    # Visual system, typography, color tokens, and cognitive load audit
├── responsive.md                       # Desktop, tablet, and mobile responsiveness patterns
├── mathematical-tests.md               # Empirical verification, edge cases (0%, 50%, 100%, pushes), and tests
├── licensing-and-data-options.md       # B2B sports data providers, legal viability, and LATAM SaaS economics
├── evidence-register.md                # Audit ledger classifying findings: OBSERVADO, INFERIDO, RECONSTRUIDO
├── unknowns-and-limitations.md         # Documented limitations, unknowns, and bounded assumptions
├── pitchlab-opportunities.md           # Strategic product opportunities and architectural differentiators
└── PITCHLAB_HANDOFF.md                 # Definitive executive handoff document for product & engineering

evidence/
├── screenshots/                        # Live PNG captures across routes and viewports
├── browser-traces/                     # REA normalized browser scenario trace files
├── network-schemas/                    # Live JSON responses from LineMate API endpoints
├── javascript/                         # Bundles, full source map (11.8MB), and 377 extracted source files
├── data-models/                        # TypeScript definitions and JSON schema contracts
├── calculations/                       # Math verification tables and formulas
└── functional-tests/                   # Automated Vitest test suite running mathematical validations
```

---

## 5. Hallazgos Empíricos Clave

1. **Full Source Map Availability**: LineMate's web production build deployed an unminified source map (`main.1f0201a8.js.map`, 11.8 MB), allowing 100% authenticated recovery of 377 original React/JSX/JS files, exact component names, calculation routines, and API endpoints.
2. **Upstream Data Provider Identified**: LineMate's backend relies directly on **Sportradar** for NFL schedule, game logs, competitor IDs (`SRID: sr:competitor:4427`), and player IDs (`SRID: sr:player:1692915`, `SRGUID`). Sleeper fantasy IDs (`sleeperId`) are also integrated for fantasy cross-referencing.
3. **No Predictive Modeling / Machine Learning Observable**: LineMate's "Trends", "Cheatsheets", and "Injury Impact" features are **100% empirical historical frequency filters**. For example:
   - "Recent Form 100%": Filter `games.slice(0, N).filter(g => g.stat > line)`.
   - "Injury Impact": Filter historical games `where teammate did not play` and compute sample frequency.
   - LineMate generates **zero** forward-looking probabilistic projections, distribution fits (Poisson/Negative Binomial), or market edge valuations. This presents a massive competitive opportunity for PitchLab.
4. **Push Handling in Denominator**: In `buildTrendsData`, LineMate's hit rate formula is `hits / games.length * 100`. Pushes are treated as non-hits in the numerator while staying in the denominator. A player with 7 hits, 1 push, and 2 misses is displayed as a 70.0% hit rate, even though a push is refunded in betting markets (where decisive hit rate is 7/9 = 77.8%).
5. **Multi-Book & Prediction Market Coverage**: LineMate aggregates standard sportsbooks (DraftKings, FanDuel, Caesars, BetMGM, Bet365, BetRivers, Unibet), DFS platforms (PrizePicks, Underdog, Betr), Canadian books (Bet99, Proline+), and innovative prediction market exchanges (**Kalshi** and **Novig**), including direct operator deep-linking.
6. **Feature Gating via Access Levels**: Client access is governed by integer levels: `0 = SUPERUSER`, `1 = FREE`, `2 = TRIAL`, `3 = PAID`. Freemium limits are implemented on both client UI and backend endpoints (`/api/nfl/v4/players/:id/record` vs `/games?withPlayerIds=...`).
